type LogLevel = "debug" | "info" | "warn" | "error";

function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
}

export function createLogger(module: string) {
  return {
    debug: (message: string) =>
      console.debug(formatMessage("debug", module, message)),
    info: (message: string) =>
      console.log(formatMessage("info", module, message)),
    warn: (message: string) =>
      console.warn(formatMessage("warn", module, message)),
    error: (message: string) =>
      console.error(formatMessage("error", module, message)),
  };
}
