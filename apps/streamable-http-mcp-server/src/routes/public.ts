import { KaapiServerRoute } from "@kaapi/kaapi";
import path from "path";

const PUBLIC_PATH = path.join(process.cwd(), "public");

export const publicFilesRoute: KaapiServerRoute = {
  method: "get",
  path: "/public/{param*}",
  handler: {
    directory: {
      path: PUBLIC_PATH,
      listing: false,
      index: true,
    },
  },
  options: {
    plugins: {
      kaapi: {
        docs: false,
      },
    },
  },
};
