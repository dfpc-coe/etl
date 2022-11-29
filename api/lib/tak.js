import EventEmitter from 'events';
import { XML as COT } from '@tak-ps/node-cot'
import * as p12 from 'p12-pem';
import path from 'path';
import tls from 'tls';

export default class TAK extends EventEmitter {
    constructor(type, opts) {
        super();

        this.type = type;
        this.opts = opts;

        this.version; // Server Version
    }

    static async connect(url) {
        if (!(url instanceof URL)) throw new Error('TAK Server URL not provided');

        if (url.protocol === 'ssl:') {
            let cert = null;
            let key = null;

            if (process.env.TAK_P12 && process.env.TAK_P12_PASSWORD) {
                const certs = p12.getPemFromP12(new URL(path.resolve(process.env.TAK_P12), import.meta.url), process.env.TAK_P12_PASSWORD)

                cert = certs.pemCertificate
                    .split('-----BEGIN CERTIFICATE-----')
                    .join('-----BEGIN CERTIFICATE-----\n')
                    .split('-----END CERTIFICATE-----')
                    .join('\n-----END CERTIFICATE-----');
                key = certs.pemKey
                    .split('-----BEGIN RSA PRIVATE KEY-----')
                    .join('-----BEGIN RSA PRIVATE KEY-----\n')
                    .split('-----END RSA PRIVATE KEY-----')
                    .join('\n-----END RSA PRIVATE KEY-----');
            }

            return await this.connect_ssl(url, cert, key);
        } else {
            throw new Error('Unknown TAK Server Protocol');
        }
    }

    static connect_ssl(url, cert, key) {
        if (!(url instanceof URL)) throw new Error('SSL url must be URL instance');
        if (typeof cert !== 'string') throw new Error('Cert must be a String');
        if (typeof key !== 'string') throw new Error('Key must be a String');

        const tak = new TAK('ssl', { url, cert, key });

        return new Promise((resolve, reject) => {
            tak.client = tls.connect({
                rejectUnauthorized: false,
                host: url.hostname,
                port: url.port,
                cert,
                key
            });

            tak.client.on('connect', () => {
                console.log('connect', tak.client.authorized);
                console.log('connect', tak.client.authorizationError);
            });

            tak.client.on('secureConnect', () => {
                console.log('secure', tak.client.authorized);
                console.log('secure', tak.client.authorizationError);
            });

            let buff = '';
            tak.client.on('data', (data) => {
                // Eventually Parse ProtoBuf
                buff = buff + data.toString();

                let result = TAK.findCoT(buff)
                while (result && result.event) {
                    const cot = new COT(result.event);

                    try {
                        if (cot.raw.event._attributes.type === 't-x-c-t-r') {
                            tak.write(COT.ping())
                            break
                        } else if (cot.raw.event._attributes.type === 't-x-takp-v') {
                            this.version = cot.raw.event.detail.TakControl.TakServerVersionInfo._attributes.serverVersion;
                        } else {
                            tak.emit('cot', cot)
                        }
                    } catch(e) {
                        console.error('Error parsing', e, data.toString())
                    }

                    buff = result.remainder

                    result = TAK.findCoT(buff)
                }
            });

            tak.client.on('error', (err) => { tak.emit('error', err); })
            tak.client.on('end', () => { tak.emit('end'); })

            return resolve(tak);
        });
    }

    /**
     * Write a COT to the TAK Connection
     */
    write(cot) {
        console.error(`writing:${cot.raw.event._attributes.type}`);
        console.error(cot.to_xml());
        this.client.write(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${cot.to_xml()}`)
    }

    static findCoT(str) { // https://github.com/vidterra/multitak/blob/main/app/lib/helper.js#L4
        let match = str.match(/(<event.*?<\/event>)(.*)/) // find first COT
        if (!match) {
            match = str.match(/(<event[^>]*\/>)(.*)/) // find first COT
            if(!match) return null
        }

        return {
            event: match[1],
            remainder: match[2],
            discard: match[0]
        }
    }
}
