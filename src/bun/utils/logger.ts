type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHTS: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function threshold(): number {
  const raw = process.env.LOG_LEVEL;
  if (!raw) return LEVEL_WEIGHTS.debug;
  const weight = LEVEL_WEIGHTS[raw as keyof typeof LEVEL_WEIGHTS];
  return weight ?? LEVEL_WEIGHTS.debug;
}

function enabled(level: LogLevel): boolean {
  return LEVEL_WEIGHTS[level] >= threshold();
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
}

export function createLogger(module: string) {
  return {
    debug: (message: string) => {
      if (enabled("debug")) console.debug(formatMessage("debug", module, message));
    },
    info: (message: string) => {
      if (enabled("info")) console.log(formatMessage("info", module, message));
    },
    warn: (message: string) => {
      if (enabled("warn")) console.warn(formatMessage("warn", module, message));
    },
    error: (message: string) => {
      if (enabled("error")) console.error(formatMessage("error", module, message));
    },
  };
}
