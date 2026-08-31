export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[90m',
  [LogLevel.INFO]: '\x1b[36m',
  [LogLevel.WARN]: '\x1b[33m',
  [LogLevel.ERROR]: '\x1b[31m',
}

const RESET = '\x1b[0m'

function timestamp(): string {
  return new Date().toISOString()
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const color = COLORS[level]
  const ctx = context ? ` ${JSON.stringify(context)}` : ''
  console.log(`${color}[${timestamp()}] [${level}]${RESET} ${message}${ctx}`)
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log(LogLevel.DEBUG, msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log(LogLevel.INFO, msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log(LogLevel.WARN, msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log(LogLevel.ERROR, msg, ctx),
}
