export interface oas {
    info: any;
    docsPath: string;
    tags: Array<any>;
    includedTags: Array<string>;
    paths: {
        [key: string]: any;
    };
    components: {
        [key: string]: any;
    };
}
