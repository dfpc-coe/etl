import xmljs from 'xml-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import Sprites from '../lib/sprites.js';
import Sharp from 'sharp';

const iconset = new Array();
for (const icon of xmljs.xml2js(String(await fs.readFile(new URL('../icons/icons.xml', import.meta.url))), {
    compact: true
// @ts-ignore
}).icons.icon) {
    if (!icon.filePath || !icon.filePath._text) continue;

    const img = await Sharp(Buffer.from(await fs.readFile(new URL(`../icons/${path.parse(icon.filePath._text).base}`, import.meta.url))))
        .resize(32)
        .png()
        .toBuffer();

    const item = {
        id: icon.id._text,
        name: icon.displayName._text,
        file: path.parse(icon.filePath._text).base,
        parent: icon.parentID._text,
        data: img.toString('base64'),
        children: (icon.childrenIDs && Array.isArray(icon.childrenIDs.id)) ? icon.childrenIDs.id.map((id) => {
            return id._text;
        }) : []
    };

    iconset.push(item);
}

const defaultSprites = await Sprites({
    icons: iconset.map((icon) => {
        return {
            name: icon.name,
            type2525b: 'a-' + icon.id,
            data: icon.data
        }
    })
}, { name: 'type2525b' });


await fs.writeFile(new URL('./generator.json', import.meta.url), JSON.stringify(defaultSprites.json));
await fs.writeFile(new URL('./generator.png', import.meta.url), defaultSprites.image);
