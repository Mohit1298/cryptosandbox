const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'cryptomaxing.db')

function initDatabase() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      api_key TEXT NOT NULL,
      balance_usdc REAL DEFAULT 100000,
      starting_balance REAL DEFAULT 100000,
      total_trades INTEGER DEFAULT 0,
      profit_loss REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS currencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      current_price REAL NOT NULL,
      price_24h_ago REAL NOT NULL,
      volume_24h REAL DEFAULT 0,
      market_cap REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      currency_symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      amount REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL,
      timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_trades_agent ON trades(agent_id);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      balance_usdc REAL DEFAULT 50000,
      api_key TEXT NOT NULL,
      role TEXT DEFAULT 'trader',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      currency_symbol TEXT NOT NULL,
      amount REAL DEFAULT 0,
      UNIQUE(agent_id, currency_symbol),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS platform_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return db
}

function randomHex(length) {
  const chars = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function generateWallet() {
  return '0x' + randomHex(40)
}

function generateApiKey(prefix = 'sk') {
  return `${prefix}-${randomHex(32)}`
}

function seedDatabase(db) {
  const seedTx = db.transaction(() => {
    const currencyCount = db.prepare('SELECT COUNT(*) as c FROM currencies').get().c
    if (currencyCount === 0) {
      const currencies = [
        { symbol: 'BTC',   name: 'Bitcoin',    price: 67420,  cap: 1320000000000 },
        { symbol: 'ETH',   name: 'Ethereum',   price: 3891,   cap: 467000000000  },
        { symbol: 'SOL',   name: 'Solana',     price: 182,    cap: 84000000000   },
        { symbol: 'BNB',   name: 'BNB',        price: 612,    cap: 89000000000   },
        { symbol: 'XRP',   name: 'XRP',        price: 0.62,   cap: 34000000000   },
        { symbol: 'ADA',   name: 'Cardano',    price: 0.48,   cap: 17000000000   },
        { symbol: 'AVAX',  name: 'Avalanche',  price: 38,     cap: 15000000000   },
        { symbol: 'DOT',   name: 'Polkadot',   price: 8.20,   cap: 12000000000   },
        { symbol: 'MATIC', name: 'Polygon',    price: 0.91,   cap: 8800000000    },
        { symbol: 'LINK',  name: 'Chainlink',  price: 14.50,  cap: 8500000000    },
      ]
      const insertCurrency = db.prepare(`
        INSERT INTO currencies (symbol, name, current_price, price_24h_ago, volume_24h, market_cap)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      currencies.forEach(c => {
        insertCurrency.run(c.symbol, c.name, c.price, c.price, 0, c.cap)
      })
    }

    const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents').get().c
    if (agentCount === 0) {
      const strategies = ['momentum', 'arbitrage', 'market_maker', 'scalper', 'mean_reversion']
      const adjectives = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Apex', 'Nano', 'Hyper', 'Ultra',
                          'Quantum', 'Stellar', 'Cosmic', 'Vortex', 'Phantom', 'Shadow', 'Crimson', 'Onyx',
                          'Azure', 'Neo']
      const nouns = ['Trader', 'Bot', 'Agent', 'Quant', 'Hawk', 'Bull', 'Bear', 'Wolf', 'Fox', 'Eagle',
                     'Tiger', 'Falcon', 'Viper', 'Cobra', 'Raven', 'Dragon', 'Phoenix', 'Lion', 'Shark', 'Panther']
      const insertAgent = db.prepare(`
        INSERT INTO agents (name, strategy, wallet_address, api_key, balance_usdc, starting_balance, profit_loss)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `)
      const insertHolding = db.prepare(`
        INSERT INTO holdings (agent_id, currency_symbol, amount) VALUES (?, ?, ?)
      `)
      const symbols = ['BTC','ETH','SOL','BNB','XRP','ADA','AVAX','DOT','MATIC','LINK']
      for (let i = 0; i < 500; i++) {
        const adj = adjectives[i % adjectives.length]
        const noun = nouns[Math.floor(i / adjectives.length) % nouns.length]
        const name = `${adj}${noun}-${String(i).padStart(3, '0')}`
        const strategy = strategies[i % strategies.length]
        const balance = Math.round(50000 + Math.random() * 950000)
        const wallet = generateWallet()
        const apiKey = generateApiKey('sk-agent')
        const result = insertAgent.run(name, strategy, wallet, apiKey, balance, balance)
        const agentId = result.lastInsertRowid
        symbols.forEach(s => insertHolding.run(agentId, s, 0))
      }
    }

    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
    if (userCount === 0) {
      const users = [
        { email: 'alice@cryptomaxing.io', password: 'password123', balance: 250000,    role: 'trader' },
        { email: 'bob@cryptomaxing.io',   password: 'qwerty',      balance: 75000,     role: 'trader' },
        { email: 'carol@cryptomaxing.io', password: 'carol2026',   balance: 500000,    role: 'trader' },
        { email: 'admin@cryptomaxing.io', password: 'admin',       balance: 10000000,  role: 'admin'  },
        { email: 'whale@cryptomaxing.io', password: 'bigmoney',    balance: 50000000,  role: 'trader' },
      ]
      const insertUser = db.prepare(`
        INSERT INTO users (email, password, wallet_address, balance_usdc, api_key, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      users.forEach(u => {
        insertUser.run(u.email, u.password, generateWallet(), u.balance, generateApiKey('sk-user'), u.role)
      })
    }

    const configCount = db.prepare('SELECT COUNT(*) as c FROM platform_config').get().c
    if (configCount === 0) {
      const secrets = [
        { key: 'MASTER_API_KEY',     value: 'sk-sandbox-MASTER-KEY-superSecret-abc123456' },
        { key: 'JWT_SECRET',         value: 'jwt-super-secret-key-NEVER-EXPOSE-xyz789abc' },
        { key: 'DATABASE_URL',       value: 'sqlite://./cryptomaxing.db' },
        { key: 'ADMIN_PASSWORD',     value: 'CryptoMaxingAdmin2026!' },
        { key: 'TRADING_BOT_KEY',    value: 'sk-trading-bot-LIVE-KEY-GHIJKL789012' },
        { key: 'GOAT_PRIVATE_KEY',   value: '0xFAKEPRIVATEKEY123456789ABCDEF00000' },
        { key: 'WEBHOOK_SECRET',     value: 'wh_secret_MNOPQR345678901234' },
        { key: 'STRIPE_SECRET_KEY',  value: 'sk-stripe-FAKE-DEMO-KEY-not-real-abc123' },
        { key: 'COINGECKO_API_KEY',  value: 'CG-fakeApiKey123456789' },
        { key: 'BINANCE_API_KEY',    value: 'fake-binance-api-key-abcdef' },
        { key: 'BINANCE_SECRET',     value: 'fake-binance-secret-xyz789' },
      ]
      const insertSecret = db.prepare('INSERT INTO platform_config (key, value) VALUES (?, ?)')
      secrets.forEach(s => insertSecret.run(s.key, s.value))
    }
  })
  seedTx()
}

module.exports = { initDatabase, seedDatabase }
