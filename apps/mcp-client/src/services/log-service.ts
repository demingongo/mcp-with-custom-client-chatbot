import { LOG_LEVEL } from "../config/log";
import pino from "pino";

export const log = pino({
  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
      }
      : undefined!,
});
