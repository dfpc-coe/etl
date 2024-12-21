import { Type } from '@sinclair/typebox'
import Schema from '@openaddresses/batch-schema';
import Err from '@openaddresses/batch-error';
import Auth from '../lib/auth.js';
import Config from '../lib/config.js';
import { Package } from '../lib/api/package.js';
import TAKAPI, {
    APIAuthCertificate,
} from '../lib/tak-api.js';

export default async function router(schema: Schema, config: Config) {
    await schema.post('/connection/:connectionid/layer/:layerid/package', {
        name: 'Create Package',
        group: 'DataAssets',
        description: 'Create a new data package',
        params: Type.Object({
            connectionid: Type.Integer({ minimum: 1 }),
            layerid: Type.Integer({ minimum: 1 })
        }),
        res: Package
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);
            const profile = await config.models.Profile.from(user.email);
            const auth = profile.auth;
            const creatorUid = profile.username;
            const api = await TAKAPI.init(new URL(String(config.server.api)), new APIAuthCertificate(auth.cert, auth.key));

            const id = crypto.randomUUID();
            const pkg = new DataPackage(id, id);

            if (req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data')) {
                const bb = busboy({
                    headers: req.headers,
                    limits: {
                        files: 1
                    }
                });

                bb.on('file', async (fieldname, file, meta) => {
                    try {
                        pkg.settings.name = meta.filename;
                        await pkg.addFile(file, {
                            name: meta.filename,
                        });
                    } catch (err) {
                         Err.respond(err, res);
                    }
                }).on('finish', async () => {
                    const out = await pkg.finalize()

                    const hash = await DataPackage.hash(out);

                    await api.Files.uploadPackage({
                        name: pkg.settings.name, creatorUid, hash
                    }, fs.createReadStream(out));

                    await pkg.destroy();

                    const pkgres = await api.Package.list({
                        uid: hash
                    });

                    if (!pkgres.results.length) throw new Err(404, null, 'Package not found');

                    res.json(pkgres.results[0]);
                });

                req.pipe(bb);
            } else {
                throw new Err(400, null, 'Unsupported Content-Type');
            }
        } catch (err) {
            Err.respond(err, res);
        }
    });
}
