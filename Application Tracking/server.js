/**
 * Job Application Tracker - Main Server
 * Siddharth's Job Search System
 *
 * Run: npm start (production) | npm run dev (development)
 * Dashboard: http://localhost:3000
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config/config');
const { logger, httpLogger } = require('./middleware/logger');
const { errorHandler, notFound } = require('./middleware/error-handler');
const { initDb } = require('./database/db');
const { initScheduler } = require('./services/scheduler');

// Route imports
const jobsRouter = require('./routes/jobs');
const referralsRouter = require('./routes/referrals');
const applicationsRouter = require('./routes/applications');
const analyticsRouter = require('./routes/analytics');
const settingsRouter = require('./routes/settings');

const app = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(httpLogger);

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/jobs', jobsRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/settings', settingsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: "Siddharth's Job Tracker",
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ─── Serve React Frontend ─────────────────────────────────────
const clientBuildPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
} else {
  // Dev mode: show helpful message at root
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job Tracker - Dev Mode</title>
        <style>
          body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; }
          h1 { color: #1a1a1a; } code { background: #f4f4f4; padding: 4px 8px; border-radius: 4px; }
          .step { background: #f9f9f9; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 8px 0; }
          a { color: #4f46e5; }
        </style>
      </head>
      <body>
        <h1>🚀 Job Tracker API is Running</h1>
        <p>Server started on <strong>http://localhost:${config.port}</strong></p>
        <h2>Start the React Dashboard</h2>
        <div class="step">1. Open a new terminal</div>
        <div class="step">2. <code>cd client && npm install && npm run dev</code></div>
        <div class="step">3. Open <a href="http://localhost:5173">http://localhost:5173</a></div>
        <h2>Or build for production</h2>
        <div class="step"><code>cd client && npm run build</code></div>
        <div class="step">Dashboard will be served at <a href="http://localhost:${config.port}">http://localhost:${config.port}</a></div>
        <h2>API Endpoints</h2>
        <ul>
          <li><a href="/api/health">/api/health</a> - Health check</li>
          <li><a href="/api/jobs">/api/jobs</a> - Job listings</li>
          <li><a href="/api/applications">/api/applications</a> - Applications</li>
          <li><a href="/api/analytics/overview">/api/analytics/overview</a> - Stats</li>
          <li><a href="/api/settings/system/status">/api/settings/system/status</a> - System status</li>
        </ul>
      </body>
      </html>
    `);
  });
}

// ─── Error Handling ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────────
async function start() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    initDb();

    // Start server
    app.listen(config.port, () => {
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`🚀 Job Tracker started!`);
      logger.info(`📊 Dashboard: http://localhost:${config.port}`);
      logger.info(`🔌 API: http://localhost:${config.port}/api`);
      logger.info(`📁 Database: ${config.database.path}`);
      logger.info(`🌍 Mode: ${config.env}`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });

    // Initialize scheduler
    initScheduler();

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

start();
