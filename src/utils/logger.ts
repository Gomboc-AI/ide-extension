import winston from 'winston';
import * as crypto from 'crypto';

const customFormat = winston.format(info => {
  info.insertId = crypto.randomUUID();
  info.timestamp = new Date().toISOString();
  return info;
});

function normalizeLevel(level: unknown): string {
  const l = typeof level === 'string' ? level.toLowerCase().trim() : '';
  switch (l) {
    case 'error':
    case 'warn':
    case 'info':
    case 'debug':
      return l;
    default:
      // Default to error-only to minimize logging overhead in normal usage.
      return 'error';
  }
}

const logger = winston.createLogger({
  // Default to error-only; debug/info logging can be very noisy and slow down scans.
  // Can be overridden via env or extension settings (see setLoggerLevel()).
  level: normalizeLevel(process.env.GOMBOC_LOG_LEVEL),
  format: winston.format.combine(customFormat(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

export function setLoggerLevel(level: unknown): void {
  logger.level = normalizeLevel(level);
}

export default logger;
