import { Response } from 'express';
import { AuthRequest } from '@tak-ps/blueprint-login';
import Err from '@openaddresses/batch-error';
import Auth from '../lib/auth.js';
import { Token } from '../lib/schema.js';
import Config from '../lib/config.js';
import { promisify } from 'util';
import crypto from 'crypto';
import Modeler, { Param } from '@openaddresses/batch-generic';
import { sql } from 'drizzle-orm';

const randomBytes = promisify(crypto.randomBytes);

export default async function router(schema: any, config: Config) {
    const TokenModel = new Modeler<typeof Token>(config.pg, Token);

    await schema.get('/token', {
        name: 'List Tokens',
        group: 'Token',
        auth: 'user',
        description: 'List all tokens associated with the requester\'s account',
        query: 'req.query.ListTokens.json',
        res: 'res.ListTokens.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            const list = await TokenModel.list({
                limit: Number(req.query.limit),
                page: Number(req.query.page),
                order: String(req.query.order),
                sort: String(req.query.sort),
                where: sql`
                    name ~* ${req.query.filter}
                `
            });

            return res.json(list);
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

            if (!req.auth.email) throw new Err(400, null, 'Tokens can only be generated by an JWT authenticated user');

            const token = await TokenModel.generate({
                ...req.body,
                token: 'etl.' + (await randomBytes(32)).toString('hex'),
                email: req.auth.email
            });

            return res.json(token[0]);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.patch('/token/:id', {
        name: 'Update Token',
        group: 'Token',
        auth: 'user',
        ':id': 'integer',
        description: 'Update properties of a Token',
        body: 'req.body.PatchToken.json',
        res: 'res.Standard.json'
    }, async (req: AuthRequest, res: Response) => {
        try {
            await Auth.is_auth(req);

            if (!req.auth.email) throw new Err(400, null, 'Tokens can only be generated by an JWT authenticated user');

            let token = await TokenModel.from(Number(req.params.id));
            if (token.email !== req.auth.email) throw new Err(400, null, 'You can only modify your own tokens');

            await TokenModel.commit(token.id, {
                updated: sql`Now()`,
                ...req.body
            });

            return res.json({ status: 200, message: 'Token Updated' });
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

            if (!req.auth.email) throw new Err(400, null, 'Tokens can only be deleted by an JWT authenticated user');

            const token = await TokenModel.from(Number(req.params.id));
            if (token.email !== req.auth.email) throw new Err(400, null, 'You can only modify your own tokens');

            await TokenModel.delete(token.id);

            return res.json({ status: 200, message: 'Token Updated' });
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}
