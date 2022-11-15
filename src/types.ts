export interface oasconfig {
    docsPath?: string;
    tags?: Array<object>;
    paths?: {
        [key: string]: object;
    };
    components?: {
        [key: string]: object;
    };
}

export interface oas {
    info: any;
    docsPath: string;
    tags: Array<any>;
    paths: {
        [key: string]: any;
    };
    components: {
        [key: string]: any;
    };
}
