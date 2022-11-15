import { SchemaOverview } from '@directus/shared/types';
import { oas, oasconfig } from './types';
const path = require('path');
const directusDir = process.cwd();

let oasBuffer: string;

export function getConfig(): oasconfig {
    try {
        return require(path.join(directusDir, './extensions/endpoints/oasconfig.js'));
    } catch (e) {
        return {};
    }
}

export async function getOas(services: any, schema: SchemaOverview): Promise<oas> {
    if (oasBuffer) return JSON.parse(oasBuffer);

    const { SpecificationService } = services;
    const service = new SpecificationService({
        accountability: { admin: true }, // null or accountability.admin = true needed
        schema,
    });

    oasBuffer = JSON.stringify(await service.oas.generate());

    return JSON.parse(oasBuffer);
}

export function merge(a: any, b: any) {
    return Object.entries(b).reduce((o, [k, v]) => {
        o[k] = v && typeof v === 'object' ? merge((o[k] = o[k] || (Array.isArray(v) ? [] : {})), v) : v;
        return o;
    }, a);
}
