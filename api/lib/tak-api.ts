import MissionData from './api/mission-data.js';
import { CookieJar, Cookie } from 'tough-cookie';
import { CookieAgent } from 'http-cookie-agent/undici';
import Err from '@openaddresses/batch-error';

export interface APIAuthInput {
    username: string;
    password: string;
}

/**
 * Handle TAK HTTP API Operations
 * @class
 */
export default class TAKAPI {
    auth: APIAuthInput;
    authorized?: {
        jwt: string;
    };
    url: URL;
    MissionData: MissionData;

    constructor(url: URL, auth: APIAuthInput) {
        this.auth = auth;

        this.url = url;

        this.MissionData = new MissionData(this);
    }

    stdurl(url: any) {
        try {
            url = new URL(url);
        } catch (err) {
            url = new URL(url, this.url);
        }

        return url;
    }

    logout() {
        delete this.authorized;
    }

    async login() {
        const url = new URL('/oauth/token', this.url);
        url.searchParams.append('grant_type', 'password');
        url.searchParams.append('username', this.auth.username);
        url.searchParams.append('password', this.auth.password);

        const authres = await fetch(url);

        if (!authres.ok) throw new Err(400, new Error(await authres.text()), 'Non-200 Response from Auth Server - Token');

        const body = await authres.json();

        this.authorized = {
            jwt: body.access_token
        };
    }

    /**
     * Standardize interactions with the backend API
     *
     * @param {URL|String} url      - Full URL or API fragment to request
     * @param {Object} [opts={}]    - Options
     */
    async fetch(url: URL, opts: any = {}) {
        url = this.stdurl(url);

        console.error('TAK API', url);

        try {
            if (!opts.headers) opts.headers = {};

            if (!(opts.body instanceof FormData) && typeof opts.body === 'object' && !opts.headers['Content-Type']) {
                opts.body = JSON.stringify(opts.body);
                opts.headers['Content-Type'] = 'application/json';
            }

            const jar = new CookieJar();

            if (this.authorized) {
                await jar.setCookie(new Cookie({
                    key: 'access_token',
                    value: this.authorized.jwt
                }), String(this.url));
            }

            const agent = new CookieAgent({ cookies: { jar } });

            opts.credentials = 'include';
            opts.dispatcher = agent;

            const res = await fetch(url, opts);

            let bdy: any = {};
            if ((res.status < 200 || res.status >= 400) && ![401].includes(res.status)) {
                try {
                    bdy = await res.json();
                } catch (err) {
                    throw new Error(`Status Code: ${res.status}`);
                }

                throw  new Error(bdy.message || `Status Code: ${res.status}`);
            }

            return await res.json();
        } catch (err) {
            throw new Err(400, null, err.message);
        }
    }
}
