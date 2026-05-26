const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK']

class SimulationEngine {
  constructor(db, priceEngine, io) {
    this.db = db
    this.priceEngine = priceEngine
    this.io = io

    this.tradeCount = 0
    this.totalVolume = 0
    this.startTime = Date.now()
    this.lastTpsCheck = Date.now()
    this.tradesSinceLastCheck = 0
    this.currentTps = 0
    this.currentVps = 0
    this.volumeSinceLastCheck = 0

    this.activeAgents = this.db.prepare(
      "SELECT id, name, strategy, balance_usdc, starting_balance FROM agents WHERE status='active'"
    ).all()

    this.insertTrade = this.db.prepare(`
      INSERT INTO trades (agent_id, currency_symbol, side, amount, price, fee, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    this.updateAgentBalance = this.db.prepare(`
      UPDATE agents
      SET balance_usdc = balance_usdc + ?,
          profit_loss = profit_loss + ?,
          total_trades = total_trades + 1
      WHERE id = ?
    `)
    this.updateHolding = this.db.prepare(`
      INSERT INTO holdings (agent_id, currency_symbol, amount)
      VALUES (?, ?, ?)
      ON CONFLICT(agent_id, currency_symbol) DO UPDATE SET amount = amount + excluded.amount
    `)
    this.updateCurrencyVolume = this.db.prepare(`
      UPDATE currencies SET volume_24h = volume_24h + ? WHERE symbol = ?
    `)
    this.getAgentBalance = this.db.prepare('SELECT balance_usdc, starting_balance FROM agents WHERE id = ?')
    this.markLiquidated = this.db.prepare("UPDATE agents SET status = 'liquidated' WHERE id = ?")
    this.respawnAgent = this.db.prepare(`
      UPDATE agents
      SET status = 'active',
          balance_usdc = starting_balance,
          profit_loss = 0
      WHERE id = ?
    `)
    this.getRecentTrades = this.db.prepare(`
      SELECT t.*, a.name as agent_name, a.strategy
      FROM trades t JOIN agents a ON t.agent_id = a.id
      ORDER BY t.timestamp DESC LIMIT ?
    `)

    this.batchExecuteTrades = this.db.transaction((trades) => {
      for (const t of trades) {
        this.insertTrade.run(t.agent_id, t.currency_symbol, t.side, t.amount, t.price, t.fee, t.timestamp)
        const pnlDelta = t.side === 'buy' ? -t.fee : (t.realizedPnl || 0) - t.fee
        const balanceDelta = t.side === 'buy' ? -(t.amount + t.fee) : (t.amount - t.fee)
        this.updateAgentBalance.run(balanceDelta, pnlDelta, t.agent_id)
        const holdingDelta = t.side === 'buy' ? (t.amount / t.price) : -(t.amount / t.price)
        this.updateHolding.run(t.agent_id, t.currency_symbol, holdingDelta)
        this.updateCurrencyVolume.run(t.amount, t.currency_symbol)
      }
    })
  }

  refreshActiveAgents() {
    this.activeAgents = this.db.prepare(
      "SELECT id, name, strategy, balance_usdc, starting_balance FROM agents WHERE status='active'"
    ).all()
  }

  start() {
    this.startTime = Date.now()

    this.priceTickInterval = setInterval(() => {
      const prices = this.priceEngine.tick()
      this.io.emit('prices', prices)
    }, 100)

    this.tradeInterval = setInterval(() => {
      const trades = this.generateTrades(30)
      if (trades.length === 0) return
      try {
        this.batchExecuteTrades(trades)
      } catch (e) {
        console.error('Trade batch error:', e.message)
        return
      }
      this.tradeCount += trades.length
      this.tradesSinceLastCheck += trades.length
      for (const t of trades) {
        this.totalVolume += t.amount
        this.volumeSinceLastCheck += t.amount
      }
      const broadcast = trades.slice(0, 5).map(t => ({
        agent_id: t.agent_id,
        agent_name: t.agent_name,
        strategy: t.strategy,
        currency_symbol: t.currency_symbol,
        side: t.side,
        amount: t.amount,
        price: t.price,
        timestamp: t.timestamp,
      }))
      for (const t of broadcast) this.io.emit('trade', t)
    }, 50)

    this.statsInterval = setInterval(() => {
      const now = Date.now()
      const elapsed = (now - this.lastTpsCheck) / 1000
      this.currentTps = this.tradesSinceLastCheck / elapsed
      this.currentVps = this.volumeSinceLastCheck / elapsed
      this.tradesSinceLastCheck = 0
      this.volumeSinceLastCheck = 0
      this.lastTpsCheck = now
      this.io.emit('stats', this.getStats())
    }, 1000)

    this.leaderboardInterval = setInterval(() => {
      const leaderboard = this.getLeaderboard()
      this.io.emit('leaderboard', leaderboard)
    }, 3000)

    this.liquidationInterval = setInterval(() => {
      this.checkLiquidations()
    }, 10000)

    this.refreshInterval = setInterval(() => {
      this.refreshActiveAgents()
    }, 5000)
  }

  stop() {
    clearInterval(this.priceTickInterval)
    clearInterval(this.tradeInterval)
    clearInterval(this.statsInterval)
    clearInterval(this.leaderboardInterval)
    clearInterval(this.liquidationInterval)
    clearInterval(this.refreshInterval)
  }

  pickStrategySide(strategy, symbol) {
    const history = this.priceEngine.getHistory(symbol)
    if (!history || history.length < 10) return Math.random() < 0.5 ? 'buy' : 'sell'
    const current = history[history.length - 1]
    const tenAgo = history[history.length - 10]
    const avg20 = history.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, history.length)

    switch (strategy) {
      case 'momentum': {
        const change = (current - tenAgo) / tenAgo
        if (change > 0.001) return 'buy'
        if (change < -0.001) return 'sell'
        return Math.random() < 0.5 ? 'buy' : 'sell'
      }
      case 'mean_reversion': {
        if (current < avg20 * 0.998) return 'buy'
        if (current > avg20 * 1.002) return 'sell'
        return Math.random() < 0.5 ? 'buy' : 'sell'
      }
      case 'scalper':
        return Math.random() < 0.5 ? 'buy' : 'sell'
      case 'market_maker':
        return Math.random() < 0.5 ? 'buy' : 'sell'
      case 'arbitrage': {
        const change = (current - tenAgo) / tenAgo
        return change > 0 ? 'sell' : 'buy'
      }
      default:
        return Math.random() < 0.5 ? 'buy' : 'sell'
    }
  }

  generateTrades(count) {
    if (this.activeAgents.length === 0) return []
    const trades = []
    const now = Date.now()
    for (let i = 0; i < count; i++) {
      const agent = this.activeAgents[Math.floor(Math.random() * this.activeAgents.length)]
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
      const price = this.priceEngine.getPrice(symbol)
      if (!price) continue

      const side = this.pickStrategySide(agent.strategy, symbol)
      let sizePct
      switch (agent.strategy) {
        case 'scalper': sizePct = 0.001 + Math.random() * 0.01; break
        case 'market_maker': sizePct = 0.005 + Math.random() * 0.015; break
        case 'momentum': sizePct = 0.01 + Math.random() * 0.04; break
        case 'arbitrage': sizePct = 0.005 + Math.random() * 0.02; break
        case 'mean_reversion': sizePct = 0.01 + Math.random() * 0.03; break
        default: sizePct = 0.005 + Math.random() * 0.02
      }
      const baseBalance = agent.starting_balance || agent.balance_usdc || 100000
      let amount = baseBalance * sizePct
      if (amount < 100) amount = 100 + Math.random() * 500
      if (amount > 500000) amount = 500000 * Math.random()

      const fee = amount * 0.001
      const realizedPnl = side === 'sell' ? amount * ((Math.random() - 0.48) * 0.01) : 0

      trades.push({
        agent_id: agent.id,
        agent_name: agent.name,
        strategy: agent.strategy,
        currency_symbol: symbol,
        side,
        amount,
        price,
        fee,
        realizedPnl,
        timestamp: now,
      })
    }
    return trades
  }

  getLeaderboard() {
    return this.db.prepare(`
      SELECT name, strategy, balance_usdc, profit_loss, total_trades, status
      FROM agents
      ORDER BY profit_loss DESC
      LIMIT 15
    `).all()
  }

  getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000
    return {
      totalTrades: this.tradeCount,
      totalVolume: this.totalVolume,
      tradesPerSecond: this.currentTps || (this.tradeCount / Math.max(elapsed, 1)),
      volumePerSecond: this.currentVps || (this.totalVolume / Math.max(elapsed, 1)),
      activeAgents: this.activeAgents.length,
      uptime: elapsed,
    }
  }

  checkLiquidations() {
    const candidates = this.db.prepare(`
      SELECT id, name, balance_usdc, starting_balance
      FROM agents
      WHERE status = 'active' AND balance_usdc < starting_balance * 0.1
      LIMIT 5
    `).all()
    for (const c of candidates) {
      this.markLiquidated.run(c.id)
      this.io.emit('liquidation', { id: c.id, name: c.name, balance: c.balance_usdc })
      setTimeout(() => {
        this.respawnAgent.run(c.id)
        this.io.emit('respawn', { id: c.id, name: c.name })
      }, 30000)
    }
    if (candidates.length > 0) this.refreshActiveAgents()
  }

  recentTrades(limit = 50) {
    return this.getRecentTrades.all(limit)
  }
}

module.exports = SimulationEngine
