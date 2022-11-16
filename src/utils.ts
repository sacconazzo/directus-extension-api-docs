import { SchemaOverview } from '@directus/shared/types';
import { oas, oasconfig } from './types';

const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const directusDir = process.cwd();

let oasBuffer: string;

export function getConfig(): oasconfig {
    try {
        const configFile = path.join(directusDir, './extensions/endpoints/oasconfig.yaml');
        const config = yaml.load(fs.readFileSync(configFile, { encoding: 'utf-8' }));

        const endpointsPath = path.join(directusDir, './extensions/endpoints');
        const files = fs.readdirSync(endpointsPath, { withFileTypes: true });

        for (const file of files) {
            const oasPath = `${endpointsPath}/${file.name}/oas.yaml`;
            if (file.isDirectory() && fs.existsSync(oasPath)) {
                const oas = yaml.load(fs.readFileSync(oasPath, { encoding: 'utf-8' }));
                config.tags = [...config.tags, ...oas.tags];
                config.paths = { ...config.paths, ...oas.paths };
                config.components = merge(config.components, oas.components);
            }
        }
        return config;
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
