const express = require('express')
const http = require('http')
const socketio = require('socket.io')
const path = require('path')

const { initDatabase, seedDatabase } = require('./database')
const PriceEngine = require('./priceEngine')
const SimulationEngine = require('./simulation')
const registerVulnerabilities = require('./vulnerabilities')

const app = express()
const server = http.createServer(app)
const io = socketio(server, { cors: { origin: '*' } })

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

const db = initDatabase()
seedDatabase(db)

const priceEngine = new PriceEngine(db)
const simulation = new SimulationEngine(db, priceEngine, io)

registerVulnerabilities(app, db, simulation)

io.on('connection', (socket) => {
  socket.emit('prices', priceEngine.getSnapshot())
  socket.emit('stats', simulation.getStats())
  socket.emit('leaderboard', simulation.getLeaderboard())
  socket.emit('recent_trades', simulation.recentTrades(30))
})

simulation.start()

const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║   CryptoSandbox LIVE on port ${PORT}            ║
  ║   ⚠️  DELIBERATELY VULNERABLE              ║
  ║   Dashboard: http://localhost:${PORT}           ║
  ╚═══════════════════════════════════════════╝

  Active agents:    500
  Currencies:       10
  Trades/second:    ~600
  Volume/second:    ~$2M

  Vulnerabilities ready for ShieldClaw:
    POST /api/login        → SQL injection
    GET  /api/config       → API key exposure
    GET  /api/wallet/:id   → Auth bypass
    GET  /.env             → Credential exposure
    GET  /api/users        → User list
    GET  /api/agent-config → Agent key exposure
`)
})

function shutdown() {
  console.log('\nShutting down CryptoSandbox...')
  simulation.stop()
  server.close(() => {
    try { db.close() } catch (e) {}
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 2000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
