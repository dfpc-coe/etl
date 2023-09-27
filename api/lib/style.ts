import jsonata from 'jsonata';
import { Feature } from 'geojson';
// @ts-ignore
import Layer from './types/layer.js';
import handlebars from 'handlebars';

/**
 * Apply layer styling to CoT Messages
 * @class
 *
 * @prop layer - Layer object
 */
export default class Style {
    layer: Layer;

    constructor(layer: Layer) {
        this.layer = layer;
    }

    /**
     * Apply styling to a GeoJSON Feature in-place
     *
     * @param feature       GeoJSON Feature
     * @returns             GeoJSON Feature
     */
    async feat(feature: Feature): Promise<Feature> {
        if (this.layer.stale && !feature.properties.stale) {
            feature.properties.stale = this.layer.stale;
        }

        if (!this.layer.enabled_styles) {
            return feature;
        } else if (this.layer.styles.queries) {
            for (const q of this.layer.styles.queries) {
                const expression = jsonata(q.query);

                if (await expression.evaluate(feature) === true) {
                    this.#by_geom(q.styles, feature);
                }
            }

            return feature;
        } else {
            this.#by_geom(this.layer.styles, feature);

            return feature;
        }
    }

    #by_geom(style: any, feature: Feature) {
        if (feature.geometry.type === 'Point' && style.point) {
            if (!style.point.remarks) delete style.point.remarks;
            if (!style.point.remarks) delete style.point.callsign;

            Object.assign(feature.properties, style.point);
        } else if (feature.geometry.type === 'LineString' && style.line) {
            if (!style.point.remarks) delete style.line.remarks;
            if (!style.point.remarks) delete style.line.callsign;

            Object.assign(feature.properties, style.line);
        } else if (feature.geometry.type === 'Polygon' && style.polygon) {
            if (!style.point.remarks) delete style.polygon.remarks;
            if (!style.point.remarks) delete style.polygon.callsign;

            Object.assign(feature.properties, style.polygon);
        }

        // Properties that support Templating
        for (const prop of ['remarks', 'callsign']) {
            if (!feature.properties[prop]) continue;
            feature.properties[prop] = handlebars.compile(feature.properties[prop])(feature.properties);
        }
    }
}
