import { LOG_LEVEL } from "../config/log";
import { createPinoLogger } from "@kaapi/logger-pino";

export const log = createPinoLogger({
  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          customLevels: 'verbose:25',
          customColors: 'verbose:cyan',
          useOnlyCustomProps: false
        }
      }
      : undefined,
});
