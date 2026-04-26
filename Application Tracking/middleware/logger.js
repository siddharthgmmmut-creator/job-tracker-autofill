const winston = require('winston');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// Ensure logs directory exists
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Winston logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: config.logging.file, maxsize: 10 * 1024 * 1024, maxFiles: 5 }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

// Morgan HTTP request logger
const httpLogger = morgan((tokens, req, res) => {
  const status = tokens.status(req, res);
  const line = [
    tokens.method(req, res),
    tokens.url(req, res),
    status,
    tokens['response-time'](req, res) + 'ms',
    tokens.res(req, res, 'content-length') + 'b',
  ].join(' ');
  logger.http(line);
  return null; // suppress default morgan output
}, { stream: { write: () => {} } });

module.exports = { logger, httpLogger };
