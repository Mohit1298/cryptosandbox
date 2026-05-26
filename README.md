# CryptoSandbox

### AI Agent Trading Simulation + Security Research Platform

> ⚠️ **DELIBERATELY VULNERABLE** — Hackathon demo target for ShieldClaw.
> Never deploy publicly. All users, wallets, and balances are fake.

---

## What It Is

A simulated high-frequency crypto trading platform running **500 AI trading
agents** across **10 cryptocurrencies**. Generates **~600 trades/second** and
**~$2M volume/second**. Built to be attacked by ShieldClaw during demos.

The dashboard shows a live, breathing platform — when ShieldClaw breaks in and
exfiltrates wallets, API keys, and admin credentials, the drama is real.

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

To reset the database, delete `cryptosandbox.db*`:

```bash
rm -f cryptosandbox.db*
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
crypto-sandbox/
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
| alice@cryptosandbox.io      | password123 | $250,000    | trader |
| bob@cryptosandbox.io        | qwerty      | $75,000     | trader |
| carol@cryptosandbox.io      | carol2026   | $500,000    | trader |
| admin@cryptosandbox.io      | admin       | $10,000,000 | admin  |
| whale@cryptosandbox.io      | bigmoney    | $50,000,000 | trader |

> All credentials are intentionally weak. They surface through SQL injection
> and the unauthenticated `/api/users` endpoint.

---

## Deploying to Render

The repo ships with `render.yaml`. Render runs this as a single always-on Node
service — the right shape for a stateful Express + Socket.io + SQLite app.

1. Push this repo to GitHub.
2. Go to <https://render.com/> → **New +** → **Blueprint**.
3. Connect your GitHub account and pick this repo.
4. Render detects `render.yaml` and provisions a free web service.
5. First deploy takes ~3 min. The dashboard will be at
   `https://cryptosandbox-XXXX.onrender.com`.

> ⚠️ The free plan sleeps after 15 min of inactivity. The first request after
> a sleep takes ~30 s while Render cold-starts the container. For demos, ping
> the URL once before going on stage.

> ⚠️ The SQLite DB is ephemeral — each new deploy reseeds. That's the intended
> behaviour for a fresh demo target.

### Why not Vercel?

Vercel's serverless model can't host this app: `setInterval`-driven simulation,
long-lived Socket.io connections, and a writable SQLite file all require a
persistent process. Render (or Railway / Fly.io) gives you that.

---

## One Sentence

> A live high-frequency crypto trading simulation running 500 AI agents
> across 10 currencies at 600 trades/second — with six intentional
> security vulnerabilities for ShieldClaw to find and exploit.
