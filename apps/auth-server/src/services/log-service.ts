import { LOG_LEVEL } from "../config/log";
import { createPinoLogger } from "@kaapi/logger-pino";

export const log = createPinoLogger({
  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
      }
      : undefined!,
});
