import { std } from '../../std.ts';
import { sector } from '@turf/sector';
import { bbox } from '@turf/bbox'
import { useCOTStore } from '../cots.ts'
import { useMapStore } from '../map.ts';
import pointOnFeature from '@turf/point-on-feature';
import type { Feature } from './../../types.ts'
import type {
    BBox as GeoJSONBBox,
    Feature as GeoJSONFeature,
    Geometry as GeoJSONGeometry,
} from 'geojson'

export interface Origin {
    mode: OriginMode,
    mode_id?: string
}

export enum OriginMode {
    CONNECTION = 'Connection',
    MISSION = 'Mission'
}

export const RENDERED_PROPERTIES = [
    'callsign',
    'fill',
    'fill-opacity',
    'stroke',
    'group',
    'icon',
    'course',
    'icon-opacity',
    'stroke-opacity',
    'marker-color',
    'marker-radius',
    'marker-opacity',
    'circle-color',
    'circle-radius',
    'circle-opacity'
]

export default class COT {
    id: string;
    path: string;
    _properties: Feature["properties"];
    _geometry: Feature["geometry"];

    _store: ReturnType<typeof useCOTStore>;
    origin: Origin;

    links: Set<string>;

    constructor(feat: Feature, origin?: Origin) {
        feat.properties = COT.style(feat.geometry.type, feat.properties);

        this.id = feat.id || crypto.randomUUID();
        this.path = feat.path || '/';
        this._properties = feat["properties"] || {};
        this._geometry = feat["geometry"];

        this._store = useCOTStore();
        this.origin = origin || { mode: OriginMode.CONNECTION };

        this.links = new Set();

        if (!this._properties.archived) {
            this._properties.archived = false
        }

        if (!this._properties.center) {
            this._properties.center = pointOnFeature(this._geometry).geometry.coordinates;
        }

        if (this.origin.mode === OriginMode.CONNECTION) {
            this._store.pending.set(this.id, this);
        }

        if (this._properties.sensor) {
            this.link();
        }
    }

    set properties(properties: Feature["properties"]) {
        this.update({ properties });
    }

    get properties() {
        return this._properties;
    }

    set geometry(geometry: Feature["geometry"]) {
        this.update({ geometry })
    }
    get geometry() {
        return this._geometry;
    }

    link(): void {
        if (this._properties.sensor) {
            const id = `${this.id}-sensor`

            let updated = false;

            console.error('SENSOR RANGE', this._properties.sensor.range)

            if (this.links.has(id)) {
                const cot = this._store.get(id);
                if (cot) {
                    updated = true;

                    cot.geometry = sector(
                        this._properties.center,
                        (this._properties.sensor.range || 10) / 1000,
                        this._properties.sensor.azimuth,
                        this._properties.sensor.azimuth + this._properties.sensor.fov,
                    ).geometry
                }
            }

            if (!updated) {
                // TODO Use NodeCoT & Respect Sensor Style if present
                new COT({
                    id,
                    type: 'Feature',
                    properties: {
                        callsign: '',
                        type: 'u-d-p',
                        stroke: '#ffffff',
                        'stroke-width': 1,
                        'stroke-opacity': 1,
                        fill: '#ffffff',
                        'fill-opacity': 0.2
                    },
                    geometry: sector(
                        this._properties.center,
                        (this._properties.sensor.range || 10) / 1000,
                        this._properties.sensor.azimuth,
                        this._properties.sensor.azimuth + this._properties.sensor.fov,
                    ).geometry
                });

                this.links.add(id)
            }
        }
    }

    /**
     * Update the COT and return a boolean as to whether the COT needs to be re-rendered
     */
    update(update: {
        properties?: Feature["properties"],
        geometry?: Feature["geometry"]
    }): boolean {
        let changed = false;
        if (update.geometry) {
            //TODO Detect Geometry changes, use centroid?!
            this._geometry = update.geometry;
            changed = true;
        }

        if (update.properties) {
            update.properties = COT.style(this._geometry.type, update.properties);

            for (const prop of RENDERED_PROPERTIES) {
                if (this._properties[prop] !== update.properties[prop]) {
                    changed = true;
                    break;
                }
            }

            if (update.properties.sensor) {
                this.link();
            } else if (this._properties.sensor && !update.properties.sensor) {
                // TODO Unlink & cleanup
            }

            this._properties = update.properties;
        }

        if (!this._properties.center) {
            this._properties.center = pointOnFeature(this._geometry).geometry.coordinates;
        }

        // TODO only update if Geometry or Rendered Prop changes
        if (this.origin.mode === OriginMode.CONNECTION) {
            this._store.pending.set(this.id, this);
        }

        return changed;
    }

    /**
     * Attempt to save the CoT to the database if necessary
     */
    async save(): Promise<void> {
        if (this.properties.archived) {
            await std('/api/profile/feature', {
                method: 'PUT',
                body: this.as_feature()
            })
        }
    }

    as_proxy(): COT {
        return new Proxy(this, {
            set(target, prop, val) {
                return Reflect.set(target, prop, val);
            },
            get(target, prop) {
                if (prop === 'properties') {
                    return new Proxy(target.properties, {
                        set(subtarget, prop, val) {
                            const res = Reflect.set(subtarget, prop, val);
                            target.update({ properties: subtarget })
                            return res;
                        }
                    })
                } else if (prop === 'geometry') {
                    return new Proxy(target.geometry, {
                        set(subtarget, prop, val) {
                            const res = Reflect.set(subtarget, prop, val);
                            target.update({ geometry: subtarget })
                            return res;
                        }
                    })
                } else {
                    return Reflect.get(target, prop);
                }
            }
        })
    }

    as_feature(): Feature {
        return {
            id: this.id,
            type: 'Feature',
            path: this.path,
            properties: this._properties,
            geometry: this._geometry
        }
    }

    /**
     * The slimmer we can get the Features, the better
     * This returns the minium feature we need to actually style the COT in the vector tiles
     */
    as_rendered(): GeoJSONFeature<GeoJSONGeometry, Record<string, unknown>> {
        const feat: GeoJSONFeature<GeoJSONGeometry, Record<string, unknown>> = {
            id: this.id,
            type: 'Feature',
            properties: {
                id: this.id,        //Vector Tiles only support integer IDs so store in props
                callsign: this._properties.callsign,
            },
            geometry: this._geometry
        };

        if (!feat.properties) feat.properties = {};

        for (const prop of RENDERED_PROPERTIES) {
            if (this._properties[prop] !== undefined) {
                feat.properties[prop] = this._properties[prop];
            }
        }

        return feat;
    }

    bounds(): GeoJSONBBox {
        return bbox(this._geometry);
    }

    /**
     * Consistent feature manipulation between add & update
     */
    static style(
        type: string,
        properties: Feature["properties"]
    ): Feature["properties"] {
        if (!properties.time) properties.time = new Date().toISOString();
        if (!properties.start) properties.start = new Date().toISOString();
        if (!properties.stale) {
            const currentTime = new Date();
            currentTime.setMinutes(currentTime.getMinutes() + 10);
            properties.stale = currentTime.toISOString();
        }

        if (!properties.remarks) {
            properties.remarks = 'None';
        }

        if (!properties.how && properties.type.startsWith('u-')) {
            properties.how = 'h-g-i-g-o';
        } else if (!properties.how) {
            properties.how = 'm-p';
        }

        if (type.includes('Point')) {
            if (properties.group) {
                properties['icon-opacity'] = 0;

                if (properties.group.name === 'Yellow') {
                    properties["marker-color"] = '#f59f00';
                } else if (properties.group.name === 'Orange') {
                    properties["marker-color"] = '#f76707';
                } else if (properties.group.name === 'Magenta') {
                    properties["marker-color"] = '#ea4c89';
                } else if (properties.group.name === 'Red') {
                    properties["marker-color"] = '#d63939';
                } else if (properties.group.name === 'Maroon') {
                    properties["marker-color"] = '#bd081c';
                } else if (properties.group.name === 'Purple') {
                    properties["marker-color"] = '#ae3ec9';
                } else if (properties.group.name === 'Dark Blue') {
                    properties["marker-color"] = '#0054a6';
                } else if (properties.group.name === 'Blue') {
                    properties["marker-color"] = '#4299e1';
                } else if (properties.group.name === 'Cyan') {
                    properties["marker-color"] = '#17a2b8';
                } else if (properties.group.name === 'Teal') {
                    properties["marker-color"] = '#0ca678';
                } else if (properties.group.name === 'Green') {
                    properties["marker-color"] = '#74b816';
                } else if (properties.group.name === 'Dark Green') {
                    properties["marker-color"] = '#2fb344';
                } else if (properties.group.name === 'Brown') {
                    properties["marker-color"] = '#dc4e41';
                } else {
                    properties["marker-color"] = '#ffffff';
                }

            } else if (properties.icon) {
                // Format of icon needs to change for spritesheet
                if (!properties.icon.includes(':')) {
                    properties.icon = properties.icon.replace('/', ':')
                }

                if (properties.icon.endsWith('.png')) {
                    properties.icon = properties.icon.replace(/.png$/, '');
                }

                const mapStore = useMapStore();
                if (mapStore.map && !mapStore.map.hasImage(properties.icon)) {
                    console.warn(`No Icon for: ${properties.icon} fallback to ${properties.type}`);
                    properties.icon = `${properties.type}`;
                }
            } else {
                // TODO Only add icon if one actually exists in the spritejson
                if (!['u-d-p'].includes(properties.type)) {
                    properties.icon = `${properties.type}`;
                }
            }
        } else if (type.includes('Line') || type.includes('Polygon')) {
            if (!properties['stroke']) properties.stroke = '#d63939';
            if (!properties['stroke-style']) properties['stroke-style'] = 'solid';
            if (!properties['stroke-width']) properties['stroke-width'] = 3;

            if (properties['stroke-opacity'] === undefined) {
                properties['stroke-opacity'] = 1;
            }

            if (type.includes('Polygon')) {
                if (!properties['fill']) properties.fill = '#d63939';

                if (properties['fill-opacity'] === undefined) {
                    properties['fill-opacity'] = 0.5;
                }
            }
        }

        return properties;
    }
}
