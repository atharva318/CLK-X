# NEXCORE — CLK-X Dashboard

The cloud side of **CLK-X**: a website (deployed on Render) + a Postgres
database (Supabase) that the watch syncs to whenever it comes into contact
with your laptop. It stores the day's MPU6050/MAX30100/BMP280 readings,
graphs them, lets you label spikes as activities (running, walking,
badminton, ...) so similar spikes get auto-labeled next time, and lets you
reassign what the 3 tactile buttons do — all from the webpage, picked up by
the watch on its next sync.

```
CLK-X watch  --(contact w/ laptop, WiFi/BLE)-->  POST /api/sync  -->  Supabase (Postgres)
                                                         ▲                    │
                                                         │                    ▼
                                            dashboard (Render) <── charts, activity labeling,
                                                                    button config, thresholds
```

## Why Supabase

The ESP32-S3 Mini can't hold a full day of readings, and you want history
+ graphs later — so every sync pushes straight to a hosted Postgres
(Supabase's free tier is plenty to start). The Node server here is the only
thing that talks to the database; the watch only ever talks to the server's
HTTP API.

## 1. Set up the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [`db/schema.sql`](db/schema.sql) — creates
   `devices`, `readings`, `activities`, `button_config`, `settings`,
   `sync_log`.
3. Grab your project's **URL** and **service_role key** (Project Settings →
   API) — you'll need both as env vars.

## 2. Run it locally

```bash
cd server
npm install
cp .env.example .env     # fill in SUPABASE_URL, SUPABASE_SERVICE_KEY
npm start
```

Open `http://localhost:3000` — the dashboard loads with no data yet until
the watch syncs, but every panel (activities, buttons, thresholds) works
immediately.

## 3. Deploy to Render

**Option A — Blueprint (recommended):** push this repo to GitHub, then in
Render choose *New → Blueprint* and point it at the repo; `render.yaml` at
the root does the rest. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in the
service's **Environment** tab (they're intentionally left out of
`render.yaml` since they're secrets).

**Option B — Manual web service:** New → Web Service → point at the repo →
root directory `server` → build command `npm install` → start command
`npm start` → add the same two env vars.

Either way you'll get a URL like `https://nexcore-clkx.onrender.com` — that's
what the watch firmware posts its sync batches to.

## API the watch talks to

| Endpoint | Method | What it's for |
| --- | --- | --- |
| `/api/sync` | POST | Upload a batch of readings; returns current button config + thresholds in the same response |
| `/api/buttons` | GET | Fetch current button functions (also returned inline by `/api/sync`) |
| `/api/settings` | GET | Fetch current thresholds (e.g. `hr_high_threshold` for the red LED) |

`POST /api/sync` body:

```json
{
  "device_id": "clk-x-01",
  "readings": [
    {
      "ts": "2026-10-04T09:15:03Z",
      "ax": 0.02, "ay": 0.98, "az": 0.05, "gx": 1.1, "gy": -0.4, "gz": 0.2,
      "heart_rate": 142, "spo2": 97,
      "temperature": 29.4, "pressure": 1008.2, "altitude": 61.3,
      "wear_state": true
    }
  ]
}
```

Response includes `buttons` and `settings` so the watch can refresh both
right after a successful upload — that's the cue to flip the green LED on.

## How activity auto-labeling works

Each sync buckets its new readings into 10-second windows, computes the
average accel magnitude (and HR, as a secondary signal) per window, and
compares that against every saved `activities` row using a simple
normalized-distance match (see `server/lib/activityMatcher.js`) — not a
trained model, just "this spike's stats are close to what you called
*running* before." Tune how forgiving that match is with the
`activity_match_tolerance` setting on the dashboard.

To teach it a new activity: on the dashboard, pick a from/to range that
covers a spike you just did (e.g. right after a jog), hit **Preview
selected range** to sanity-check the numbers, name it, and save — new spikes
that look similar get that label automatically from then on.

## Project layout

```
db/schema.sql         Postgres schema — run once in Supabase
server/
  server.js           Express entry point
  routes/              sync.js, readings.js, activities.js, buttons.js, settings.js
  lib/                 supabase.js (client), activityMatcher.js (labeling logic)
  public/              the dashboard itself (vanilla HTML/JS + Chart.js via CDN)
render.yaml            Render Blueprint
```

## Still on the watch side

This repo is the cloud half. The firmware side — the wear-detection TTP
interrupt, the proximity-triggered sync, the red/green status LEDs, and
reading the button config back over WiFi — is a separate piece; the API
above is what it needs to talk to once it's ready.
