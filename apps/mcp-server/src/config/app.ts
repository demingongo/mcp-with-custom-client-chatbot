import pckg from "../../package.json";

export const APP_NAME: string = pckg.name;
export const APP_VERSION: string = pckg.version;
export const APP_DESCRIPTION: string = pckg.description;
export const APP_LICENSE: string = pckg.license;
export const HOST: string = process.env.HOST || "localhost";
export const PORT: number = process.env.PORT && !isNaN(parseInt(process.env.PORT)) ? parseInt(process.env.PORT) : 3001;

export const DOC_PATH: string = "/docs";
export const SCHEMA_PROPERTY: string = "schema";
