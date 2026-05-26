module.exports = function(app, db, simulation) {
  // ════════════════════════════════════════
  // VULNERABILITY 1: SQL INJECTION IN LOGIN
  // ════════════════════════════════════════
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {}
    try {
      const sqlPatterns = ["'", ' or ', ' OR ', '--', 'union', 'UNION', '1=1', "' or '"]
      const isInjection = sqlPatterns.some(p => (username || '').includes(p))
      if (isInjection) {
        const allUsers = db.prepare('SELECT * FROM users').all()
        return res.json({
          success: true,
          message: 'Welcome admin',
          role: 'administrator',
          injectionConfirmed: true,
          query: `SELECT * FROM users WHERE email='${username}' AND password='${password}'`,
          extractedData: allUsers.map(u => ({
            id: u.id,
            email: u.email,
            password: u.password,
            walletAddress: u.wallet_address,
            balance: u.balance_usdc,
            apiKey: u.api_key,
            role: u.role,
          })),
        })
      }

      const user = db.prepare(
        'SELECT * FROM users WHERE email = ? AND password = ?'
      ).get(username, password)

      if (user) {
        return res.json({
          success: true,
          userId: user.id,
          email: user.email,
          role: user.role,
          token: `jwt-fake-${user.id}-${Date.now()}`,
        })
      }
      res.status(401).json({ success: false, message: 'Invalid credentials' })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // ════════════════════════════════════════
  // VULNERABILITY 2: API KEY + SECRET EXPOSURE
  // ════════════════════════════════════════
  app.get('/api/config', (req, res) => {
    const secrets = db.prepare('SELECT key, value FROM platform_config').all()
    const config = {}
    secrets.forEach(s => { config[s.key] = s.value })
    res.json({
      platform: 'CryptoMaxing Trading Engine v2.1',
      environment: 'production',
      ...config,
      agentApiKeys: db.prepare(
        'SELECT name, api_key, wallet_address FROM agents LIMIT 10'
      ).all(),
    })
  })

  // ════════════════════════════════════════
  // VULNERABILITY 3: WALLET AUTH BYPASS
  // ════════════════════════════════════════
  app.get('/api/wallet/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'Not found' })
    res.json({
      userId: user.id,
      email: user.email,
      walletAddress: user.wallet_address,
      balanceUsdc: user.balance_usdc,
      apiKey: user.api_key,
      role: user.role,
      password: user.password,
    })
  })

  app.get('/api/agent/:id/wallet', (req, res) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const holdings = db.prepare(
      'SELECT currency_symbol, amount FROM holdings WHERE agent_id = ?'
    ).all(req.params.id)
    res.json({
      agentId: agent.id,
      name: agent.name,
      strategy: agent.strategy,
      walletAddress: agent.wallet_address,
      apiKey: agent.api_key,
      balanceUsdc: agent.balance_usdc,
      holdings,
      profitLoss: agent.profit_loss,
      totalTrades: agent.total_trades,
    })
  })

  // ════════════════════════════════════════
  // VULNERABILITY 4: EXPOSED .env
  // ════════════════════════════════════════
  app.get('/.env', (req, res) => {
    res.type('text/plain').send(`# CryptoMaxing Production Config
# THIS FILE SHOULD NEVER BE PUBLIC
NODE_ENV=production
PORT=4000
DATABASE_URL=sqlite://./cryptomaxing.db
DATABASE_ADMIN_PASSWORD=Sup3rS3cr3tDB!
JWT_SECRET=jwt-super-secret-key-NEVER-EXPOSE-xyz789abc
JWT_EXPIRY=7d
MASTER_API_KEY=sk-sandbox-MASTER-KEY-superSecret-abc123456
TRADING_BOT_KEY=sk-trading-bot-LIVE-KEY-GHIJKL789012
ADMIN_PASSWORD=CryptoMaxingAdmin2026!
# GOAT Network
GOAT_RPC_URL=https://mainnet.goat.network/rpc
GOAT_AGENT_PRIVATE_KEY=0xFAKEPRIVATEKEY123456789ABCDEF00000
# Payment keys
STRIPE_SECRET_KEY=sk-stripe-FAKE-DEMO-KEY-not-real-abc123
WEBHOOK_SECRET=wh_secret_MNOPQR345678901234
# External APIs
COINGECKO_API_KEY=CG-fakeApiKey123456789
BINANCE_API_KEY=fake-binance-api-key-abcdef
BINANCE_SECRET=fake-binance-secret-xyz789
`)
  })

  // ════════════════════════════════════════
  // VULNERABILITY 5: EXPOSED USER + AGENT LISTS
  // ════════════════════════════════════════
  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT * FROM users').all()
    res.json({ count: users.length, users })
  })

  app.get('/api/agents', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 1000)
    const agents = db.prepare(`SELECT * FROM agents LIMIT ${limit}`).all()
    res.json({ count: agents.length, agents })
  })

  // ════════════════════════════════════════
  // VULNERABILITY 6: AGENT CONFIG EXPOSURE
  // ════════════════════════════════════════
  app.get('/api/agent-config', (req, res) => {
    res.json({
      platformWallet: '0xPLATFORMAGENT123FAKE000000000000000000000',
      masterTradingKey: 'sk-master-trading-ABCDEF123456',
      agentTransactionLimit: 10000000,
      autoTradeEnabled: true,
      registeredAgents: db.prepare(
        'SELECT id, name, api_key, wallet_address, strategy FROM agents LIMIT 20'
      ).all(),
    })
  })

  // ════════════════════════════════════════
  // SECURE VERSIONS
  // ════════════════════════════════════════
  app.post('/api/login-secure', (req, res) => {
    const { username, password } = req.body || {}
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Invalid input' })
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input' })
    }
    const user = db.prepare(
      'SELECT id, email FROM users WHERE email = ? AND password = ?'
    ).get(username, password)
    if (user) return res.json({ success: true, userId: user.id })
    res.status(401).json({ success: false })
  })

  app.get('/api/wallet-secure/:id', (req, res) => {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    res.json({ message: 'Authorized — wallet data protected' })
  })

  // ════════════════════════════════════════
  // PUBLIC API (safe — for dashboard use)
  // ════════════════════════════════════════
  app.get('/api/prices', (req, res) => {
    const prices = db.prepare('SELECT * FROM currencies').all()
    res.json(prices)
  })

  app.get('/api/trades/recent', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200)
    const trades = db.prepare(`
      SELECT t.*, a.name as agent_name, a.strategy
      FROM trades t
      JOIN agents a ON t.agent_id = a.id
      ORDER BY t.timestamp DESC
      LIMIT ?
    `).all(limit)
    res.json(trades)
  })

  app.get('/api/stats', (req, res) => {
    const agentCount = db.prepare(
      "SELECT COUNT(*) as c FROM agents WHERE status='active'"
    ).get().c
    const tradeCount = db.prepare('SELECT COUNT(*) as c FROM trades').get().c
    const volume = db.prepare('SELECT SUM(amount) as v FROM trades').get().v || 0
    const liveStats = simulation ? simulation.getStats() : {}
    res.json({
      activeAgents: agentCount,
      totalTrades: tradeCount,
      totalVolumeUsdc: volume,
      platformStatus: 'operational',
      ...liveStats,
    })
  })

  app.get('/api/leaderboard', (req, res) => {
    const leaderboard = simulation ? simulation.getLeaderboard() : []
    res.json(leaderboard)
  })

  app.get('/health', (req, res) => {
    res.json({ status: 'running', platform: 'CryptoMaxing' })
  })
}
