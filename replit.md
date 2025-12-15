# Omar AI WhatsApp Bot

## Overview

A professional WhatsApp bot built with Baileys library that provides multimedia downloading, AI-powered conversations, and group management features. The bot supports downloading content from various platforms (YouTube, TikTok, Instagram, Facebook, Twitter, Pinterest, MediaFire, Google Drive), interacting with users via Google's Gemini AI, and managing WhatsApp groups with anti-spam features.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technology Stack
- **Runtime**: Node.js with ES Modules
- **WhatsApp Client**: Baileys (@itsukichan/baileys) - unofficial WhatsApp Web API
- **AI Integration**: Google Generative AI (Gemini) for conversational responses
- **API Server**: Python FastAPI server running on port 8000 for app downloads and web scraping
- **Database**: PostgreSQL (optional, via DATABASE_URL environment variable)

### Application Structure
```
├── bot.js                 # Main entry point - WhatsApp connection and message handling
├── config/config.js       # Bot configuration (API keys, developer info, limits)
├── src/
│   ├── storage.js         # JSON-based data persistence (users, blocklist, settings)
│   ├── group-manager.js   # Group moderation (anti-link, anti-badwords, anti-time)
│   ├── interactive-buttons.js  # WhatsApp interactive message builders
│   ├── api/api_server.py  # Python FastAPI server for downloads
│   └── utils/
│       ├── gemini-brain.js    # AI conversation processing with Gemini
│       ├── gemini-scraper.js  # Gemini web scraping fallback
│       └── file-splitter.js   # Large file splitting (>2GB support)
├── plugins/               # Modular command handlers
│   ├── youtube.js, tiktok.js, instagram.js, etc.  # Platform downloaders
│   ├── groupadmin.js      # Group administration commands
│   └── ai-image.js        # AI image generation
└── data/                  # Persistent JSON storage
```

### Plugin Architecture
- Plugins are self-contained modules with `name`, `patterns` (URL regex), and `commands` arrays
- Each plugin exports a `handler(sock, remoteJid, text, msg, utils, senderPhone)` function
- URL-based plugins auto-detect links; command plugins respond to prefixed commands

### Data Storage
- **Primary**: JSON files in `/data/` directory for users, blocklist, group settings
- **Conversations**: Stored per-user in `/conversations/` as JSON files
- **Database**: Optional PostgreSQL via `/database/schema.sql` for persistent storage
- **Cache**: NodeCache for message retry counters and response deduplication

### Group Management Features
- Anti-link detection with configurable patterns (WhatsApp, Telegram, Discord, etc.)
- Anti-bad words filtering with warning system
- Anti-time scheduling for automated rules
- Anti-private messaging controls

### File Handling
- Large file splitting using aria2c for downloads >1.9GB
- Automatic chunking into 1GB parts for WhatsApp's file size limits
- Temp storage in `/tmp/file_splits/`

### Bot Modes
- `all`: Responds to both groups and private chats
- `groups`: Groups only
- `private`: Private chats only

## External Dependencies

### APIs and Services
- **Google Gemini AI**: Primary conversational AI (requires GEMINI_API_KEY)
- **TikWM API**: TikTok video downloads
- **SaveTube API**: YouTube video/audio downloads
- **Various scraper endpoints**: Instagram, Facebook, Twitter, Pinterest
- **Modded APK Sources**: AN1.com for modded games/apps (مهكرة)

### File Size Limits
- **Regular users**: 1GB maximum download size
- **VIP/Admin/Developers**: Unlimited download size

### System Tools
- **aria2c**: High-speed parallel file downloader
- **apkeep**: Android APK download tool (binary in project root)

### Python Services
- FastAPI server (`src/api/api_server.py`) handles:
  - App store scraping
  - APK downloads
  - Web content extraction via trafilatura
  - Runs on localhost:8000

### Database
- PostgreSQL (optional) - connection via DATABASE_URL environment variable
- Schema initialization via `init_database.js`

### Key Environment Variables
- `GEMINI_API_KEY`: Google Generative AI API key
- `DATABASE_URL`: PostgreSQL connection string (optional)