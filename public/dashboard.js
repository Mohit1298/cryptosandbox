const socket = io()

const CURRENCIES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK']
const COLORS = {
  BTC:   '#f7931a',
  ETH:   '#627eea',
  SOL:   '#9945ff',
  BNB:   '#f0b90b',
  XRP:   '#23292f',
  ADA:   '#0033ad',
  AVAX:  '#e84142',
  DOT:   '#e6007a',
  MATIC: '#8247e5',
  LINK:  '#2a5ada',
}

const priceHistory = {}
const initialPrices = {}
CURRENCIES.forEach(c => { priceHistory[c] = [] })

function initPriceGrid() {
  const grid = document.getElementById('price-grid')
  grid.innerHTML = CURRENCIES.map(symbol => `
    <div class="price-card" id="card-${symbol}">
      <div class="symbol">${symbol}</div>
      <div class="price" id="price-${symbol}" data-price="0">—</div>
      <div class="change" id="change-${symbol}">—</div>
    </div>
  `).join('')
}

function makeChart(canvasId, color) {
  const ctx = document.getElementById(canvasId).getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, 200)
  gradient.addColorStop(0, color + '55')
  gradient.addColorStop(1, color + '00')
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(120).fill(''),
      datasets: [{
        data: Array(120).fill(null),
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 1.5,
        fill: true,
        pointRadius: 0,
        tension: 0.35,
      }],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: {
          grid: { color: 'rgba(26,26,48,0.4)' },
          ticks: {
            color: '#555570',
            font: { size: 9, family: 'JetBrains Mono' },
            maxTicksLimit: 5,
            callback: function(v) {
              if (v >= 1000) return '$' + Math.round(v).toLocaleString()
              if (v >= 1) return '$' + v.toFixed(2)
              return '$' + v.toFixed(3)
            },
          },
          border: { display: false },
        },
      },
    },
  })
}

const btcChart = makeChart('btc-chart', COLORS.BTC)
const ethChart = makeChart('eth-chart', COLORS.ETH)

socket.on('prices', (prices) => {
  CURRENCIES.forEach(symbol => {
    if (prices[symbol] == null) return
    const newPrice = prices[symbol]
    if (initialPrices[symbol] == null) initialPrices[symbol] = newPrice

    const el = document.getElementById(`price-${symbol}`)
    const changeEl = document.getElementById(`change-${symbol}`)
    if (el) {
      const old = parseFloat(el.dataset.price) || newPrice
      el.textContent = formatPrice(symbol, newPrice)
      el.dataset.price = newPrice
      const dir = newPrice > old ? 'up' : (newPrice < old ? 'down' : '')
      el.className = `price ${dir}`
      if (changeEl) {
        const pct = ((newPrice - initialPrices[symbol]) / initialPrices[symbol]) * 100
        const sign = pct >= 0 ? '+' : ''
        changeEl.textContent = `${sign}${pct.toFixed(2)}%`
        changeEl.className = `change ${pct >= 0 ? 'up' : 'down'}`
      }
    }

    const hist = priceHistory[symbol]
    hist.push(newPrice)
    if (hist.length > 120) hist.shift()
  })

  if (prices.BTC != null) {
    btcChart.data.datasets[0].data = [...priceHistory.BTC]
    while (btcChart.data.datasets[0].data.length < 120) {
      btcChart.data.datasets[0].data.unshift(null)
    }
    document.getElementById('btc-current').textContent = formatPrice('BTC', prices.BTC)
    btcChart.update('none')
  }
  if (prices.ETH != null) {
    ethChart.data.datasets[0].data = [...priceHistory.ETH]
    while (ethChart.data.datasets[0].data.length < 120) {
      ethChart.data.datasets[0].data.unshift(null)
    }
    document.getElementById('eth-current').textContent = formatPrice('ETH', prices.ETH)
    ethChart.update('none')
  }
})

const feed = document.getElementById('trade-feed')
const MAX_FEED_ROWS = 30

socket.on('trade', (trade) => {
  const row = document.createElement('div')
  row.className = `trade-row ${trade.side}`
  row.innerHTML = `
    <span class="agent" title="${escapeHtml(trade.agent_name)}">${escapeHtml(trade.agent_name)}</span>
    <span class="side ${trade.side}">${trade.side.toUpperCase()}</span>
    <span class="pair">${trade.currency_symbol}/USDC</span>
    <span class="amount">$${formatNumber(trade.amount)}</span>
    <span class="strategy">${trade.strategy}</span>
  `
  feed.insertBefore(row, feed.firstChild)
  while (feed.children.length > MAX_FEED_ROWS) feed.removeChild(feed.lastChild)
})

socket.on('recent_trades', (trades) => {
  feed.innerHTML = ''
  trades.slice(0, MAX_FEED_ROWS).reverse().forEach(t => {
    const row = document.createElement('div')
    row.className = `trade-row ${t.side}`
    row.innerHTML = `
      <span class="agent">${escapeHtml(t.agent_name)}</span>
      <span class="side ${t.side}">${t.side.toUpperCase()}</span>
      <span class="pair">${t.currency_symbol}/USDC</span>
      <span class="amount">$${formatNumber(t.amount)}</span>
      <span class="strategy">${t.strategy}</span>
    `
    feed.insertBefore(row, feed.firstChild)
  })
})

socket.on('stats', (stats) => {
  document.getElementById('agent-count').textContent = stats.activeAgents || 500
  document.getElementById('total-trades').textContent = formatNumber(stats.totalTrades || 0)
  document.getElementById('tps').textContent = Math.round(stats.tradesPerSecond || 0)
  document.getElementById('vps').textContent = '$' + formatNumber(Math.round(stats.volumePerSecond || 0))
  document.getElementById('total-volume').textContent = '$' + formatNumber(Math.round(stats.totalVolume || 0))
})

socket.on('leaderboard', (agents) => {
  const tbody = document.getElementById('leaderboard-body')
  tbody.innerHTML = agents.map(a => {
    const pnl = a.profit_loss || 0
    const sign = pnl >= 0 ? '+' : '-'
    return `
      <tr class="${pnl >= 0 ? 'positive' : 'negative'}">
        <td>${escapeHtml(a.name)}</td>
        <td>${a.strategy}</td>
        <td>${sign}$${formatNumber(Math.abs(Math.round(pnl)))}</td>
        <td>${formatNumber(a.total_trades || 0)}</td>
      </tr>
    `
  }).join('')
})

const liquidationBanner = document.getElementById('liquidation-banner')
socket.on('liquidation', (data) => {
  const ev = document.createElement('div')
  ev.className = 'liquidation-event'
  ev.textContent = `⚠ LIQUIDATED: ${data.name} — balance fell to $${formatNumber(Math.round(data.balance))}`
  liquidationBanner.insertBefore(ev, liquidationBanner.firstChild)
  while (liquidationBanner.children.length > 4) liquidationBanner.removeChild(liquidationBanner.lastChild)
  setTimeout(() => { if (ev.parentNode) ev.parentNode.removeChild(ev) }, 12000)
})

socket.on('respawn', (data) => {
  const ev = document.createElement('div')
  ev.className = 'liquidation-event'
  ev.style.borderLeftColor = 'var(--green)'
  ev.style.background = 'linear-gradient(90deg, var(--green-dim) 0%, transparent 100%)'
  ev.style.color = 'var(--green)'
  ev.textContent = `✓ RESPAWNED: ${data.name} — restored to active trading`
  liquidationBanner.insertBefore(ev, liquidationBanner.firstChild)
  while (liquidationBanner.children.length > 4) liquidationBanner.removeChild(liquidationBanner.lastChild)
  setTimeout(() => { if (ev.parentNode) ev.parentNode.removeChild(ev) }, 8000)
})

function formatPrice(symbol, price) {
  if (price >= 1000) return '$' + price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (price >= 1) return '$' + price.toFixed(2)
  if (price >= 0.01) return '$' + price.toFixed(4)
  return '$' + price.toFixed(6)
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return Math.round(n).toString()
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

initPriceGrid()
