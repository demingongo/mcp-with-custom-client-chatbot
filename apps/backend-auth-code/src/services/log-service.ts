import { createPinoLogger } from "@kaapi/logger-pino";
import { APP_NAME } from "../config/app";
import { LOG_LEVEL } from "../config/log";

export const log = createPinoLogger({
  name: APP_NAME,
  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
      }
      : undefined!,
});
