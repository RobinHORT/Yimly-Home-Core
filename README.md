# Yimly Home Assistant Server

A complete, production-ready server combining **Real Home Assistant Core** with the custom **Yimly Location & Device Tracking UI**, official **Home Assistant Companion App** compatibility (iOS & Android), persistent SQLite Recorder, Docker deployment, and Cloudflare Tunnel network integration.

---

## 🏗️ Architecture

```
                 INTERNET
                    │
                CLOUDFLARE
                    │
            Cloudflare Tunnel
                    │
          External Docker Network
          (cloudflare_tunnel_net)
                    │
        ┌────────────────────────┐
        │   YIMLY HA CONTAINER   │
        │                        │
        │  REAL HOME ASSISTANT   │
        │       CORE             │
        │                        │
        │  • Auth & Users        │
        │  • REST API            │
        │  • WebSocket API       │
        │  • Event Bus           │
        │  • State Machine       │
        │  • Entity Registry     │
        │  • Device Registry     │
        │  • Person & Tracker    │
        │  • Mobile App Engine   │
        │  • SQLite Recorder     │
        │  • History & Logbook   │
        │          ↓             │
        │     YIMLY UI           │
        │  (Location & Tracking) │
        └────────────────────────┘
                    ↑
                    │
       Official Home Assistant
          Companion App
                    │
          iOS / Android Phone
```

---

## 🚀 Quick Start (Docker)

### 1. Prerequisites
- Docker Engine & Docker Compose
- (Optional) Cloudflare Tunnel with an external Docker network

### 2. Configure Environment
Copy `.env.example` to `.env` and configure your settings:
```bash
cp .env.example .env
```

### 3. Start Container
```bash
docker compose up -d
```

### 4. Windows 1-Click Update
Run `update.bat` to safely pull changes, rebuild the image, run database migrations, and preserve all `/config` data (users, auth, tokens, entity/device registries, SQLite history).

---

## 📱 Official Home Assistant Companion App Connection

1. Download the official **Home Assistant** app from Apple App Store or Google Play Store.
2. Open the app and enter the server address:
   - Local: `http://<YOUR_LOCAL_IP>:8123` (or `http://<YOUR_LOCAL_IP>:3000`)
   - Cloudflare: `https://your-domain.com`
3. Log in with your Home Assistant credentials or create an owner account.
4. Allow Location Permissions ("Always" for real-time background location updates).
5. The Companion App will automatically register:
   - `device_tracker.<phone_name>`
   - `sensor.<phone_name>_battery_level`
   - `sensor.<phone_name>_battery_state`
   - `sensor.<phone_name>_geocoded_location`
6. View live GPS coordinates, altitude, speed, precision radius, battery status, and history directly in the Yimly UI.

---

## 💾 Persistent Storage (`/config`)

All data is stored inside `./config` which is mapped as a volume:
- `configuration.yaml`: Home Assistant configuration
- `home-assistant_v2.db`: SQLite Recorder database preserving entity state history
- `.storage/`: Home Assistant internal storage (auth credentials, user accounts, entity registry, device registry, area registry, companion app webhooks)

Container recreation or updates will **never** wipe your users or location history.
