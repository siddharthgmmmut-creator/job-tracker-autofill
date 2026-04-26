require('dotenv').config();
const path = require('path');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 3000,

  database: {
    path: path.resolve(process.env.DATABASE_PATH || './data/jobs.db'),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: path.resolve(process.env.LOG_FILE || './logs/app.log'),
  },

  scheduler: {
    scraperSchedule: process.env.SCRAPER_SCHEDULE || '0 7 * * *',
    followupSchedule: process.env.FOLLOWUP_SCHEDULE || '0 9 * * *',
    backupSchedule: process.env.BACKUP_SCHEDULE || '59 23 * * 0',
  },

  user: {
    name: process.env.USER_NAME || 'Siddharth',
    email: process.env.USER_EMAIL || 'siddharthgmmmut@gmail.com',
    phone: process.env.USER_PHONE || '+91-8765627606',
    linkedinCookie: process.env.LINKEDIN_SESSION_COOKIE || '',
  },

  backup: {
    dir: path.resolve(process.env.BACKUP_DIR || './backups'),
    maxBackups: parseInt(process.env.MAX_BACKUPS) || 12,
  },

  scraper: {
    userAgent: process.env.SCRAPER_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  },

  isDev: () => config.env === 'development',
  isProd: () => config.env === 'production',
};

module.exports = config;
