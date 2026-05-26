class PriceEngine {
  constructor(db) {
    this.db = db
    this.volatility = {
      BTC:   0.0015,
      ETH:   0.0025,
      SOL:   0.0045,
      BNB:   0.0025,
      XRP:   0.0070,
      ADA:   0.0065,
      AVAX:  0.0055,
      DOT:   0.0055,
      MATIC: 0.0075,
      LINK:  0.0050,
    }

    const rows = this.db.prepare('SELECT symbol, current_price FROM currencies').all()
    this.prices = {}
    this.anchors = {}
    this.history = {}
    rows.forEach(r => {
      this.prices[r.symbol] = r.current_price
      this.anchors[r.symbol] = r.current_price
      this.history[r.symbol] = new Array(60).fill(r.current_price)
    })

    this.updateStmt = this.db.prepare('UPDATE currencies SET current_price = ? WHERE symbol = ?')
    this.updateMany = this.db.transaction((updates) => {
      for (const u of updates) this.updateStmt.run(u.price, u.symbol)
    })
  }

  tick() {
    const updates = []
    for (const symbol in this.prices) {
      const vol = this.volatility[symbol] || 0.003
      const price = this.prices[symbol]
      const anchor = this.anchors[symbol]

      const random = (Math.random() - 0.5) * 2
      const reversion = (anchor - price) / anchor * 0.02
      const drift = (Math.random() - 0.5) * 0.0001
      const change = price * (vol * random + reversion + drift)

      let newPrice = price + change
      const minPrice = anchor * 0.6
      const maxPrice = anchor * 1.6
      if (newPrice < minPrice) newPrice = minPrice + (minPrice - newPrice) * 0.5
      if (newPrice > maxPrice) newPrice = maxPrice - (newPrice - maxPrice) * 0.5
      if (newPrice <= 0) newPrice = anchor * 0.5

      this.prices[symbol] = newPrice
      const hist = this.history[symbol]
      hist.push(newPrice)
      if (hist.length > 60) hist.shift()
      updates.push({ symbol, price: newPrice })
    }

    this.updateMany(updates)

    return this.getSnapshot()
  }

  getSnapshot() {
    const snapshot = {}
    for (const symbol in this.prices) {
      snapshot[symbol] = this.prices[symbol]
    }
    return snapshot
  }

  getHistory(symbol) {
    return this.history[symbol] ? [...this.history[symbol]] : []
  }

  getPrice(symbol) {
    return this.prices[symbol]
  }
}

module.exports = PriceEngine
