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
