import winston from 'winston';
import * as crypto from 'crypto';

globalThis.crypto = crypto as any;

const customFormat = winston.format(info => {
  info.insertId = crypto.randomUUID();
  info.timestamp = new Date().toISOString();
  return info;
});

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(customFormat(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

export default logger;
