import { Response } from 'express';
import { AuthRequest } from '@tak-ps/blueprint-login';
import Err from '@openaddresses/batch-error';
import Auth from '../lib/auth.js';
// @ts-ignore
import Token from '../lib/types/token.js';
import Config from '../lib/config.js';

export default async function router(schema: any, config: Config) {
    await schema.get('/token', {
        name: 'List Tokens',
        group: 'Token',
        auth: 'user',
        description: 'List all tokens associated with the requester\'s account',
        res: 'res.ListTokens.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            return res.json(await Token.list(config.pool));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.post('/token', {
        name: 'Create Tokens',
        group: 'Token',
        auth: 'user',
        description: 'Create a new API token for programatic access',
        body: 'req.body.CreateToken.json',
        res: 'res.CreateToken.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            return res.json(await Token.generate(config.pool, req.body));
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.delete('/token/:id', {
        name: 'Delete Tokens',
        group: 'Token',
        auth: 'user',
        description: 'Delete a user\'s API Token',
        ':id': 'integer',
        res: 'res.Standard.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            return res.json(await Token.delete(config.pool, req.params.id));
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}
