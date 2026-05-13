import pckg from "../../package.json";

export const APP_NAME: string = pckg.name;
export const APP_VERSION: string = pckg.version;
export const APP_DESCRIPTION: string = pckg.description || "";
export const APP_LICENSE: string = pckg.license;
export const SERVER_BIND_ADDRESS: string = process.env.SERVER_BIND_ADDRESS || "localhost";
export const PORT: number = process.env.PORT && !isNaN(parseInt(process.env.PORT)) ? parseInt(process.env.PORT) : 3002;
export const EXTERNAL_URI: string = process.env.EXTERNAL_URI || `http://${SERVER_BIND_ADDRESS}:${PORT}`;

export const DOC_PATH: string = "/docs/api";
export const SCHEMA_PROPERTY: string = "schema";
