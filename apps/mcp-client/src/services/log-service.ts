import { LOG_LEVEL, LOG_NAME } from "../config/log";
import pino from "pino";

export const log = pino({
  name: LOG_NAME,
  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
      }
      : undefined!,
});
