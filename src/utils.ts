/* eslint-disable @typescript-eslint/ban-ts-comment */
import { SchemaOverview } from '@directus/types';
import { oas, oasConfig } from './types';

const { findWorkspaceDir } = require('@pnpm/find-workspace-dir');
const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const directusDir = () => process.cwd();
const extensionDir = process.env.EXTENSIONS_PATH || './extensions';

let oasBuffer: string;

/**
 * Retrieves the configuration for OpenAPI specification (OAS) generation.
 * The function attempts to load the configuration from a YAML file located in the specified extension directory.
 * If the file is not found, it falls back to a legacy location.
 * If the configuration file is not valid or cannot be read, it returns a default configuration.
 *
 * @returns {oasConfig} The OAS configuration.
 */
function getConfigRoot(): oasConfig {
    const defConfig: oasConfig = {
        docsPath: 'api-docs',
        info: {},
        tags: [],
        publishedTags: [],
        useAuthentication: false,
        paths: {},
        components: {},
    };
    try {
        let config;
        try {
            // packaged extensions
            const configFile = path.join(directusDir(), extensionDir, '/oasconfig.yaml');
            config = yaml.load(fs.readFileSync(configFile, { encoding: 'utf-8' }));
        } catch {
            // legacy
            const configFile = path.join(directusDir(), extensionDir, '/endpoints/oasconfig.yaml');
            config = yaml.load(fs.readFileSync(configFile, { encoding: 'utf-8' }));
        }
        config.docsPath = config.docsPath || defConfig.docsPath;
        config.info = config.info || defConfig.info;
        config.tags = config.tags || defConfig.tags;
        config.publishedTags = config.publishedTags || defConfig.publishedTags;
        config.useAuthentication = typeof config.useAuthentication === 'boolean' ? config.useAuthentication : defConfig.useAuthentication;
        config.paths = config.paths || defConfig.paths;
        config.components = config.components || defConfig.components;
        return config;
    } catch {
        return defConfig;
    }
}

/**
 * Filters the paths and tags in the OpenAPI specification (OAS) based on the published tags
 * specified in the configuration. It removes any paths and tags that are not marked as published.
 *
 * @param config - The configuration object containing the published tags.
 * @param oas - The OpenAPI specification object to be filtered.
 */
export function filterPaths(config: oasConfig, oas: oas) {
    for (const path in oas.paths) {
        for (const method in oas.paths[path]) {
            let published = false;

            // @ts-ignore
            const tags = oas.paths[path][method].tags || [];

            tags.forEach(tag => {
                published = published || config.publishedTags.includes(tag);
            });

            // @ts-ignore
            oas.paths[path][method].tags = tags.filter(tag => config.publishedTags.includes(tag));

            // @ts-ignore
            if (!published) delete oas.paths[path][method];
        }
    }
    oas.tags = oas.tags.filter(tag => config.publishedTags.includes(tag.name));
}

export function getConfig(): oasConfig {
    const config = getConfigRoot();
    try {
        const mergeConfig = (oasPath: string) => {
            const oas = yaml.load(fs.readFileSync(oasPath, { encoding: 'utf-8' }));
            config.tags = [...config.tags, ...(oas.tags || [])];
            config.paths = { ...config.paths, ...(oas.paths || {}) };
            config.components = merge(config.components || {}, oas.components || {});
        };

        const extensionsPath = path.join(directusDir(), extensionDir);
        const files = fs.readdirSync(extensionsPath, { withFileTypes: true });
        for (const file of files) {
            const oasPath = `${extensionsPath}/${file.name}/oas.yaml`;
            if (file.isDirectory() && fs.existsSync(oasPath)) mergeConfig(oasPath);
        }

        const legacyEndpointsPath = path.join(directusDir(), extensionDir, '/endpoints');
        const legacyFiles = fs.readdirSync(legacyEndpointsPath, { withFileTypes: true });
        for (const file of legacyFiles) {
            const oasPath = `${legacyEndpointsPath}/${file.name}/oas.yaml`;
            if (file.isDirectory() && fs.existsSync(oasPath)) mergeConfig(oasPath);
        }

        return config;
    } catch (e) {
        return config;
    }
}

export async function getOasAll(services: any, schema: SchemaOverview): Promise<oas> {
    if (oasBuffer) return JSON.parse(oasBuffer);

    const { SpecificationService } = services;
    const service = new SpecificationService({
        accountability: { admin: true },
        schema,
    });

    oasBuffer = JSON.stringify(await service.oas.generate());

    return JSON.parse(oasBuffer);
}

export async function getOas(services: any, schema: SchemaOverview, accountability: any): Promise<oas> {
    const { SpecificationService } = services;
    const service = new SpecificationService({
        accountability,
        schema,
    });

    const oas = JSON.stringify(await service.oas.generate());

    return JSON.parse(oas);
}

export async function getPackage() {
    try {
        const workspaceDir = await findWorkspaceDir('.');
        return require(`${workspaceDir || directusDir()}/package.json`);
    } catch (e) {
        return {};
    }
}

export function merge(a: any, b: any) {
    return Object.entries(b).reduce((o, [k, v]) => {
        o[k] = v && typeof v === 'object' ? merge((o[k] = o[k] || (Array.isArray(v) ? [] : {})), v) : v;
        return o;
    }, a);
}
