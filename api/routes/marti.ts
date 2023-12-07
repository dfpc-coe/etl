import Err from '@openaddresses/batch-error';
import Auth from '../lib/auth.js';
import Config from '../lib/config.js';
import { Response } from 'express';
import { AuthRequest } from '@tak-ps/blueprint-login';
import TAKAPI, {
    APIAuthToken,
    APIAuthPassword
} from '../lib/tak-api.js';

export default async function router(schema: any, config: Config) {
    await schema.get('/marti/group', {
        name: 'List Groups',
        group: 'Marti',
        auth: 'user',
        description: 'Helper API to list groups that the client is part of',
        query: {
            type: 'object',
            properties: {
                useCache: {
                    type: 'boolean',
                    description: 'This tells TAK server to return the users cached group selection vs the groups that came directly from the auth backend.'
                }
            }
        },
        res: 'res.Marti.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            if (!req.auth.email) throw new Err(400, null, 'Groups can only be listed by a JWT authenticated user');

            const api = await TAKAPI.init(new URL(config.MartiAPI), new APIAuthToken(req.auth.token));

            const query = {};
            for (const q in req.query) query[q] = String(req.query[q]);
            const groups = await api.Group.list(query);

            return res.json(groups);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.get('/marti/api/contacts/all', {
        name: 'List Groups',
        group: 'Marti',
        auth: 'user',
        description: 'Helper API to list contacts',
        res: 'res.Marti.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            if (!req.auth.email) throw new Err(400, null, 'Contacts can only be listed by a JWT authenticated user');

            const api = await TAKAPI.init(new URL(config.MartiAPI), new APIAuthToken(req.auth.token));

            const contacts = await api.Contacts.list();

            return res.json(contacts);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.post('/marti/signClient', {
        name: 'Sign Client',
        group: 'Marti',
        auth: 'user',
        description: 'Helper API for obtaining a signed Certificate pair given LDAP Credentials',
        body: 'req.body.MartiSignClient.json',
        res: 'res.MartiSignClient.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            const api = await TAKAPI.init(new URL(config.MartiAPI), new APIAuthPassword(req.body.username, req.body.password));

            const certs = await api.Credentials.generate();

            return res.json(certs);
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}
