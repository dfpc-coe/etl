import Err from '@openaddresses/batch-error';
// @ts-ignore
import BaseMap from '../lib/types/basemap.js';
// @ts-ignore
import Data from '../lib/types/data.js';
import Auth from '../lib/auth.js';
import busboy from 'busboy';
import { sql } from 'slonik';
import Config from '../lib/config.js';
import { Request, Response } from 'express';
import xml2js from 'xml2js';
import { Stream } from 'node:stream';

export default async function router(schema: any, config: Config) {
    await schema.put('/basemap', {
        name: 'Import BaseMaps',
        group: 'BaseMap',
        auth: 'user',
        description: `
            If the Content-Type if text/plain, then assume the body contains a TileJSON URL
            Alternatively, if the Content-Type is a MultiPart upload, assume the input is a TAK XML document

            Both return as many BaseMap fields as possible to use in the creation of a new BaseMap
        `,
        res: 'res.ImportBaseMap.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req);

            const imported: {
                name?: string;
                minzoom?: Number;
                maxzoom?: Number;
                format?: string;
            } = {};

            if (req.headers['content-type'].startsWith('multipart/form-data')) {
                const bb = busboy({
                    headers: req.headers,
                    limits: {
                        files: 1
                    }
                });

                let buffer: Buffer;
                bb.on('file', async (fieldname, file, blob) => {
                    try {
                        buffer = await stream2buffer(file);
                    } catch (err) {
                        return Err.respond(err, res);
                    }
                }).on('finish', async () => {
                    try {
                        const xml = await xml2js.parseStringPromise(String(buffer));
                        if (!xml.customMapSource) return res.json(imported);
                        const map = xml.customMapSource;

                        if (map.name && map.name.length) {
                            imported.name = xml.customMapSource.name[0];
                        }
                        if (map.minZoom && map.minZoom.length) {
                            imported.minzoom = parseInt(xml.customMapSource.minZoom[0]);
                        }
                        if (map.maxZoom && map.maxZoom.length) {
                            imported.maxzoom = parseInt(xml.customMapSource.maxZoom[0]);
                        }
                        if (map.format && map.format.length) {
                            imported.format = xml.customMapSource.format[0];
                        }

                        return res.json(imported);
                    } catch (err) {
                        Err.respond(err, res);
                    }
                });

                return req.pipe(bb);
            } else if (req.headers['content-type'].startsWith('text/plain')) {
                return res.json(imported);
            } else {
                throw new Err(400, null, 'Unsupported Content-Type');
            }
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.get('/basemap', {
        name: 'List BaseMaps',
        group: 'BaseMap',
        auth: 'user',
        description: 'List BaseMaps',
        query: 'req.query.ListBaseMaps.json',
        res: 'res.ListBaseMaps.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req);

            const list = await BaseMap.list(config.pool, req.query);

            return res.json(list);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.post('/basemap', {
        name: 'Create BaseMap',
        group: 'BaseMap',
        auth: 'admin',
        description: 'Register a new basemap',
        body: 'req.body.CreateBaseMap.json',
        res: 'basemaps.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req);

            const basemap = await BaseMap.generate(config.pool, req.body);

            return res.json(basemap);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.patch('/basemap/:basemapid', {
        name: 'Update BaseMap',
        group: 'BaseMap',
        auth: 'admin',
        description: 'Update a basemap',
        ':basemapid': 'integer',
        body: 'req.body.PatchBaseMap.json',
        res: 'basemaps.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req);
            const basemap = await BaseMap.commit(config.pool, req.params.basemapid, {
                updated: sql`Now()`,
                ...req.body
            });

            return res.json(basemap);
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.get('/basemap/:basemapid', {
        name: 'Get BaseMap',
        group: 'BaseMap',
        auth: 'user',
        description: 'Get a basemap',
        ':basemapid': 'integer',
        query: 'req.query.BaseMap.json',
        res: 'basemaps.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req, true);

            const basemap = await BaseMap.from(config.pool, req.params.basemapid);

            if (req.query.download) {
                res.setHeader('Content-Disposition', `attachment; filename="${basemap.name}.${req.query.format}"`);
            }

            if (req.query.format === 'xml') {
                const builder = new xml2js.Builder();

                res.setHeader('Content-Type', 'text/xml');

                const xml = builder.buildObject({
                    customMapSource: {
                        name: { _: basemap.name },
                        minZoom: { _: '' },
                        maxZoom: { _: '' },
                        tileType: { _: '' },
                        tileUpdate: { _: 'None' },
                        url: { _: 'None' },
                        backgroundColor: { _: '#000000' },
                    }
                });

                return res.send(xml);
            } else {
                return res.json(basemap);
            }
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.delete('/basemap/:basemapid', {
        name: 'Delete BaseMap',
        group: 'BaseMap',
        auth: 'user',
        description: 'Delete a basemap',
        ':basemapid': 'integer',
        res: 'res.Standard.json'
    }, async (req: Request, res: Response) => {
        try {
            await Auth.is_auth(req);

            await BaseMap.delete(config.pool, req.params.basemapid);

            return res.json({
                status: 200,
                message: 'BaseMap Deleted'
            });
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}

async function stream2buffer(stream: Stream): Promise<Buffer> {
    return new Promise < Buffer > ((resolve, reject) => {
        const _buf = Array < any > ();
        stream.on("data", chunk => _buf.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(_buf)));
        stream.on("error", (err: Error) => reject(`error converting stream - ${err}`));
    });
}

