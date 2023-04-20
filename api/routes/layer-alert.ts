import Err from '@openaddresses/batch-error';
// @ts-ignore
import Layer from '../lib/types/layer.js';
// @ts-ignore
import LayerAlert from '../lib/types/layer-alert.js';
import Cacher from '../lib/cacher.js';
import { sql } from 'slonik';
import Auth from '../lib/auth.js';
import { Request, Response } from 'express';
import Config from '../lib/config.js';

export default async function router(schema: any, config: Config) {
    await schema.get('/layer/:layerid/alert', {
        name: 'List Alerts',
        group: 'Layer Alerts',
        auth: 'user',
        description: 'List layer alerts',
        query: 'req.query.ListLayerAlerts.json',
        res: 'res.ListLayerAlerts.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req);

            const layer = await config.cacher.get(Cacher.Miss(req.query, `layer-${req.params.layerid}`), async () => {
                return (await Layer.from(config.pool, req.params.layerid)).serialize();
            });

            const list = await LayerAlert.list(config.pool, layer.id, req.query);

            res.json(list);
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}
