import { Type } from '@sinclair/typebox'
import Schema from '@openaddresses/batch-schema';
import Err from '@openaddresses/batch-error';
import Auth from '../lib/auth.js';
import Weather, { FetchHourly } from '../lib/weather.js';
import Config from '../lib/config.js';

export default async function router(schema: Schema, config: Config) {
    const weather = new Weather();

    await schema.get('/search/reverse/:longitude/:latitude', {
        name: 'Reverse Geocode',
        group: 'Search',
        description: 'Get information about a given point',
        params: Type.Object({
            latitude: Type.Number(),
            longitude: Type.Number()
        }),
        res: Type.Object({
            weather: FetchHourly
        })
    }, async (req, res) => {
        try {
            const user = await Auth.as_user(config, req);
            const response = {
                weather: null
            };

            response.weather = await weather.get(req.params.longitude, req.params.latitude);
    
            return res.json(response);
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}