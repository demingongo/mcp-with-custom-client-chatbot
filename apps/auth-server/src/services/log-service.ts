import { ILogger } from "@kaapi/kaapi";
import { LOG_LEVEL } from "../config/log";
import pino from "pino";

export const log = pino({
  // keep the standard levels active (trace, debug, info, warn, error, fatal)
  useOnlyCustomLevels: false,

  // define custom log levels in addition to the standard ones
  customLevels: {
    silly: 5, // Sits below trace (10)
    verbose: 15, // Sits between trace (10) and debug (20)
    warning: 40, // Alias for the standard warn level
    err: 50, // Alias for the standard error level
  },

  // customize the behavior of the log method through hooks
  hooks: {
    logMethod(args, method) {
      if (args.length > 1) {
        const firstArg = args.shift();
        const secondArg = args.shift();

        let formattedArgs: [obj: unknown, msg?: string | undefined, ...args: unknown[]] | undefined = undefined;
        if (typeof firstArg === 'string') {
          const matches = firstArg.match(/%[sdoOj]/g);
          const placeholdersCount = matches ? matches.length : 0;
          if (placeholdersCount > 0) {
            formattedArgs = [{}, firstArg, secondArg, ...args];
          } else {
            formattedArgs = [{}, [firstArg, secondArg, ...args].map((a) => {
              if (a instanceof Error) return `${a.constructor.name}: ${a.message}`;
              try {
                if (typeof a != 'string') a = JSON.stringify(a);
              } catch (_e) {
                try {
                  if (typeof a != 'string') a = a?.toString();
                } catch (_e) {
                  //
                }
              }
              return a;
            })
              .join(' ')];
          }
        } else if (typeof secondArg === 'string') {
          const matches = secondArg.match(/%[sdoOj]/g);
          const placeholdersCount = matches ? matches.length : 0;
          if (placeholdersCount > 0) {
            formattedArgs = [firstArg, secondArg, ...args];
          } else {
            formattedArgs = [firstArg, [secondArg, ...args].map((a) => {
              if (a instanceof Error) return `${a.constructor.name}: ${a.message}`;
              try {
                if (typeof a != 'string') a = JSON.stringify(a);
              } catch (_e) {
                try {
                  if (typeof a != 'string') a = a?.toString();
                } catch (_e) {
                  //
                }
              }
              return a;
            })
              .join(' ')];
          }
        }

        if (formattedArgs)
          method.apply(this, formattedArgs);
        else
          method.apply(this, args);
      } else {
        method.apply(this, args);
      }
    }
  },

  level: LOG_LEVEL,
  transport:
    LOG_LEVEL === "debug"
      ? {
        target: "pino-pretty",
      }
      : undefined!,
});

export const logger = log as pino.Logger<"silly" | "verbose" | "warning" | "err", false> & ILogger