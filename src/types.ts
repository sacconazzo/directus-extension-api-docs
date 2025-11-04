export interface oasConfig {
    docsPath: string;
    info: any;
    tags: Array<any>;
    publishedTags: Array<string>;
    useAuthentication: boolean;
    paths: {
        [key: string]: any;
    };
    components: {
        [key: string]: any;
    };
}

export interface oas {
    info: any;
    tags: Array<any>;
    paths: {
        [key: string]: {
            [key: string]: {
                tags: Array<string>;
            };
        };
    };
    components: {
        [key: string]: any;
    };
}
