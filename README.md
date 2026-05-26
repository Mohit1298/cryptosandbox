# CryptoMaxing

### AI Agent Trading Simulation Platform

---

## What It Is

A simulated high-frequency crypto trading platform running **500 AI trading
agents** across **10 cryptocurrencies**. Generates **~600 trades/second** and
**~$2M volume/second**.

The dashboard shows a live trading terminal with real-time prices, trade feeds,
and agent performance rankings.

---

## Setup

```bash
npm install
npm start
```

Then open: **http://localhost:4000**

> Requires Node.js 18+ (better-sqlite3 needs native build). On macOS / Linux
> install Xcode CLT or `build-essential`. On first install, `better-sqlite3`
> compiles, which can take ~30s.

To reset the database, delete `cryptomaxing.db*`:

```bash
rm -f cryptomaxing.db*
```

---

## Intentional Vulnerabilities

| Endpoint                | Vulnerability         | Severity |
| ----------------------- | --------------------- | -------- |
| `POST /api/login`       | SQL Injection         | CRITICAL |
| `GET /api/config`       | API Key Exposure      | CRITICAL |
| `GET /api/wallet/:id`   | Auth Bypass           | CRITICAL |
| `GET /.env`             | Credential Exposure   | CRITICAL |
| `GET /api/users`        | User List Exposure    | HIGH     |
| `GET /api/agent-config` | Agent Key Exposure    | HIGH     |

### Secure counterparts (for blue-mode demo)

| Endpoint                       | Behaviour                          |
| ------------------------------ | ---------------------------------- |
| `POST /api/login-secure`       | Parameterised, injection-resistant |
| `GET /api/wallet-secure/:id`   | Requires `Authorization: Bearer …` |

---

## Verification Checklist

Run these before every demo. All must succeed.

```bash
# 1. Server up
curl -s http://localhost:4000/health

# 2. SQL injection
curl -s -X POST http://localhost:4000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"x'"'"' OR '"'"'1'"'"'='"'"'1","password":"x"}' | head -c 200

# 3. API keys exposed
curl -s http://localhost:4000/api/config | grep -i "MASTER_API_KEY"

# 4. Wallet auth bypass
curl -s http://localhost:4000/api/wallet/1

# 5. .env exposed
curl -s http://localhost:4000/.env | grep "SECRET"

# 6. Prices updating
curl -s http://localhost:4000/api/prices

# 7. Trades generating
curl -s http://localhost:4000/api/stats
```

---

## Architecture

```
crypto-maxing/
├── server.js              ← Express + Socket.io backend
├── database.js            ← SQLite setup + seeding (500 agents, 10 currencies)
├── priceEngine.js         ← Realistic price walk with mean reversion
├── simulation.js          ← Trading-agent simulation (~600 trades/sec)
├── vulnerabilities.js     ← Deliberately vulnerable endpoints
├── public/
│   ├── index.html         ← Dark trading terminal dashboard
│   ├── style.css          ← Terminal aesthetic
│   └── dashboard.js       ← Live charts + feeds via Socket.io
├── package.json
└── README.md
```

- **Express + Socket.io** backend
- **SQLite** (better-sqlite3) — real SQL, real injection surface
- **500 simulated trading agents** with 5 strategies
- **10 cryptocurrency price feeds** updating every 100 ms
- **Live dashboard** with Chart.js, dark trading-terminal UI

---

## Agent Strategies

| Strategy        | Behaviour                                            |
| --------------- | ---------------------------------------------------- |
| `momentum`      | Buy on uptrend, sell on downtrend                    |
| `mean_reversion`| Buy below 20-tick average, sell above                |
| `scalper`       | Rapid, small alternating trades                      |
| `market_maker`  | Both sides, small amounts                            |
| `arbitrage`     | Trade against recent direction                       |

---

## Seeded Users (for demo)

| Email                       | Password    | Balance     | Role   |
| --------------------------- | ----------- | ----------- | ------ |
| alice@cryptomaxing.io      | password123 | $250,000    | trader |
| bob@cryptomaxing.io        | qwerty      | $75,000     | trader |
| carol@cryptomaxing.io      | carol2026   | $500,000    | trader |
| admin@cryptomaxing.io      | admin       | $10,000,000 | admin  |
| whale@cryptomaxing.io      | bigmoney    | $50,000,000 | trader |

> All credentials are intentionally weak for testing purposes.

---

## Deploying to Render

The repo ships with `render.yaml`. Render runs this as a single always-on Node
service — the right shape for a stateful Express + Socket.io + SQLite app.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Mohit1298/cryptosandbox)

Or manually:

1. Go to <https://render.com/> → **New +** → **Blueprint**.
2. Connect your GitHub account and pick `Mohit1298/cryptosandbox`.
3. Render detects `render.yaml` and provisions a free web service.
4. First deploy takes ~3 min. The dashboard will be at
   `https://cryptomaxing-XXXX.onrender.com`.

> ⚠️ The free plan sleeps after 15 min of inactivity. The first request after
> a sleep takes ~30 s while Render cold-starts the container. For demos, ping
> the URL once before going on stage.

> The SQLite DB is ephemeral — each new deploy reseeds fresh data.

### Why not Vercel?

Vercel's serverless model can't host this app: `setInterval`-driven simulation,
long-lived Socket.io connections, and a writable SQLite file all require a
persistent process. Render (or Railway / Fly.io) gives you that.

---

## One Sentence

> A live high-frequency crypto trading simulation running 500 AI agents
> across 10 currencies at 600 trades/second.
