import winston from 'winston';

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
