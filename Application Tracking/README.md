# 💼 Siddharth's Job Application Tracker

**Automated Job Tracking & Referral Finder System**
Built for: Siddharth | IIM Lucknow MBA '21 | siddharthgmmmut@gmail.com

---

## 🚀 Quick Start (3 steps)

### Step 1 — Install Node.js (if not installed)

```bash
# Option A: Using Homebrew (recommended for Mac)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node

# Option B: Download from https://nodejs.org (LTS version)
```

### Step 2 — Run Setup Script

```bash
cd "Application Tracking"
bash setup.sh
```

This installs all dependencies, initializes the database, and builds the React dashboard.

### Step 3 — Start the Server

```bash
npm start
# → Dashboard available at http://localhost:3000
```

---

## 🖥️ Development Mode (live reload)

```bash
# Terminal 1 — API server
npm start              # Runs on port 3000

# Terminal 2 — React dev server (hot reload)
cd client
npm run dev            # Runs on http://localhost:5173
```

---

## 🧩 Chrome Extension Setup

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `./extension` folder in this project
5. The 💼 icon will appear in your Chrome toolbar

**Extension shortcuts:**
- `Cmd+Shift+F` (Mac) / `Ctrl+Shift+F` (Windows) — Auto-fill current form

---

## 📊 Dashboard Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Overview stats, pipeline, follow-ups |
| Job Listings | `/jobs` | All scraped jobs with filters |
| Referral Finder | `/referrals` | Find LinkedIn referrals by job |
| Application Tracker | `/applications` | Track all applications & status |
| Analytics | `/analytics` | Charts, conversion rates, scraper logs |
| Settings | `/settings` | Preferences, backup, system status |

---

## 🤖 Automated Scraping

Jobs are scraped automatically every day at **7:00 AM IST** from:
- **Naukri.com** — Primary source (uses their search API)
- **IIMjobs.com** — Senior/MBA roles
- **LinkedIn Jobs** — Requires session cookie (see setup below)

**Manual trigger:** Click "🔍 Scrape Now" in the sidebar or go to Settings.

### LinkedIn Scraping Setup

1. Log into LinkedIn in Chrome
2. Open DevTools → Application → Cookies → `linkedin.com`
3. Copy the `li_at` cookie value
4. Add to `.env`: `LINKEDIN_SESSION_COOKIE=your_cookie_here`
5. Restart the server

---

## 🤝 Referral Finder

For each job, the system generates priority-ranked LinkedIn search URLs:

| Priority | Connection Type |
|----------|----------------|
| ⭐⭐⭐⭐⭐ | IIM Lucknow Alumni |
| ⭐⭐⭐⭐⭐ | Darwinbox Colleagues |
| ⭐⭐⭐⭐ | MMMUT Alumni |
| ⭐⭐⭐⭐ | Prime Focus Colleagues |
| ⭐⭐⭐ | St Joseph's Alumni / GSK Colleagues |
| ⭐⭐ | Role-relevant people (GTM, Ops) |
| ⭐ | General senior employees |

Pre-written message templates are generated for each referral.

---

## 📋 API Reference

```
GET  /api/jobs                     → List jobs (supports filters)
POST /api/jobs                     → Add job manually
GET  /api/referrals?job_id=X       → Get referrals for job
GET  /api/referrals/linkedin-search/:jobId → LinkedIn search URLs
GET  /api/referrals/message-template/:id   → Pre-written message
GET  /api/applications             → List applications
POST /api/applications             → Track application
PUT  /api/applications/:id         → Update status/notes
GET  /api/analytics/overview       → Dashboard stats
GET  /api/analytics/daily          → Daily activity (30 days)
GET  /api/analytics/export         → Export all data as JSON
GET  /api/settings                 → All settings
POST /api/settings/backup          → Create backup
POST /api/settings/scrape/run      → Trigger manual scrape
GET  /api/settings/system/status   → System health
```

---

## 💾 Data & Backups

- **Database:** SQLite at `./data/jobs.db` (auto-created)
- **Backups:** JSON snapshots at `./backups/` (auto weekly, Sunday 11:59 PM)
- **Max backups kept:** 12 (oldest auto-deleted)
- **Manual backup:** Settings page → "💾 Backup Now"
- **Export all data:** Settings → "↓ Export JSON" (or `/api/analytics/export`)

---

## ⚙️ Configuration (.env)

```env
PORT=3000
DATABASE_PATH=./data/jobs.db
SCRAPER_SCHEDULE=0 7 * * *          # 7:00 AM daily
FOLLOWUP_SCHEDULE=0 9 * * *         # 9:00 AM daily
BACKUP_SCHEDULE=59 23 * * 0         # Sunday 11:59 PM
LINKEDIN_SESSION_COOKIE=            # Your li_at cookie
MIN_SALARY=2700000                  # ₹27L minimum
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm start` fails | Run `npm install` first |
| Dashboard blank | Run `cd client && npm run build` |
| No jobs being scraped | Check internet, then "Scrape Now" in Settings |
| LinkedIn not scraping | Add `LINKEDIN_SESSION_COOKIE` to `.env` |
| Database locked | Restart server: `npm start` |
| Extension not working | Reload at `chrome://extensions/` |
| Port 3000 in use | Change `PORT=3001` in `.env` |

---

## 📁 Project Structure

```
Application Tracking/
├── server.js              ← Main server entry point
├── database/
│   ├── db.js              ← SQLite setup & helpers
│   └── schema.sql         ← Database schema
├── routes/                ← API route handlers
│   ├── jobs.js
│   ├── referrals.js
│   ├── applications.js
│   ├── analytics.js
│   └── settings.js
├── scrapers/              ← Job platform scrapers
│   ├── naukri-scraper.js
│   ├── linkedin-scraper.js
│   └── iimjobs-scraper.js
├── services/              ← Core business logic
│   ├── scheduler.js       ← Cron jobs
│   ├── referral-finder.js ← Referral search + messages
│   └── backup.js          ← Data backup/restore
├── client/                ← React dashboard (Vite)
│   └── src/
│       ├── pages/         ← 6 dashboard pages
│       └── components/    ← Reusable UI components
├── extension/             ← Chrome extension
│   ├── manifest.json
│   ├── popup.html/js      ← Extension popup
│   └── content.js         ← Form auto-fill injection
├── data/                  ← SQLite database (auto-created)
├── backups/               ← Backup files (auto-created)
├── logs/                  ← Application logs
└── .env                   ← Configuration (edit this!)
```

---

## 🎯 Daily Workflow

### Morning (~5 min)
1. Open http://localhost:3000
2. Check Dashboard for today's new jobs
3. Go to Job Listings → sort by "Date Posted" newest first

### Per Job (~3-5 min)
1. Click job card → "🤝 Referrals"
2. Click highest-priority LinkedIn search URL
3. Find alumni/ex-colleague → add to referrals
4. Click "💬 Message" → copy template → send on LinkedIn
5. Click "✓ Mark Applied" on job card
6. (Optional) Use Chrome Extension to auto-fill the actual application

### Evening (~2 min)
1. Check Analytics for today's stats
2. Note follow-up reminders on Dashboard
3. Update any statuses (got call, rejected, etc.)

---

*Built April 2026 — Siddharth, IIM Lucknow MBA '21*
