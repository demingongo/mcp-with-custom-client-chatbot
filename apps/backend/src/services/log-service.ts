import { APP_NAME } from "../config/app";
import { LOG_LEVEL } from "../config/log";
import pino from "pino";

export const log = pino({
  name: APP_NAME,
  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
      }
      : undefined!,
});
