#!/bin/bash
# ============================================================
# Job Tracker Setup Script - Siddharth's Job Search System
# Run: bash setup.sh
# ============================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}${BOLD}  💼 Job Tracker Setup — Siddharth${NC}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Check Node.js ────────────────────────────────────────────
echo -e "${BOLD}[1/5] Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}Node.js not found. Installing via Homebrew...${NC}"

  # Install Homebrew if not present
  if ! command -v brew &>/dev/null; then
    echo -e "${YELLOW}Installing Homebrew first...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add brew to PATH (Apple Silicon)
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi

  brew install node
  echo -e "${GREEN}✅ Node.js installed: $(node --version)${NC}"
else
  echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"
fi

# ── Install backend dependencies ──────────────────────────────
echo ""
echo -e "${BOLD}[2/5] Installing backend dependencies...${NC}"
cd "$(dirname "$0")"
npm install
echo -e "${GREEN}✅ Backend dependencies installed${NC}"

# ── Initialize database ───────────────────────────────────────
echo ""
echo -e "${BOLD}[3/5] Initializing database...${NC}"
mkdir -p data logs backups
node database/db.js
echo -e "${GREEN}✅ Database initialized${NC}"

# ── Install frontend dependencies ────────────────────────────
echo ""
echo -e "${BOLD}[4/5] Installing React frontend dependencies...${NC}"
cd client
npm install
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
cd ..

# ── Build frontend ────────────────────────────────────────────
echo ""
echo -e "${BOLD}[5/5] Building React dashboard...${NC}"
cd client
npm run build
cd ..

# Copy build to server
echo -e "${GREEN}✅ Dashboard built${NC}"

# ── Done! ────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  🎉 Setup Complete!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. Start the server:"
echo -e "     ${CYAN}npm start${NC}"
echo ""
echo -e "  2. Open your dashboard:"
echo -e "     ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  3. Run your first job scrape:"
echo -e "     Click ${CYAN}'🔍 Scrape Now'${NC} in the sidebar"
echo ""
echo -e "  4. Install the Chrome Extension:"
echo -e "     • Open ${CYAN}chrome://extensions/${NC}"
echo -e "     • Enable Developer mode"
echo -e "     • Click 'Load unpacked' → select ${CYAN}./extension${NC} folder"
echo ""
echo -e "  For dev mode (live reload):"
echo -e "     Terminal 1: ${CYAN}npm start${NC}"
echo -e "     Terminal 2: ${CYAN}cd client && npm run dev${NC}"
echo -e "     Open: ${CYAN}http://localhost:5173${NC}"
echo ""
