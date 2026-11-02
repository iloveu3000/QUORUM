import 'dotenv/config'
import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import { SignalEngine } from './signalEngine.js'

const app = express()
const server = http.createServer(app)
const io = new Server(server)
const port = Number(process.env.PORT || 3001)
const engine = new SignalEngine({
  threshold: Number(process.env.QUORUM_THRESHOLD || 5),
  cooldownMs: Number(process.env.QUORUM_DISCOVERY_COOLDOWN_MS || 60_000),
  onUpdate: (event) => io.emit('signal:update', event),
})
app.use(express.json())

let demoTimer = null
let demoIndex = 0
let demoState = 'stopped'
const demoLines = [
  ['mossybyte', 'the statue just moved'], ['lunarloop', 'wait the statue moved'], ['orbitaltoast', 'STATUE MOVED??'], ['softreset', 'did that statue move'], ['duskdrive', 'that statue is moving'], ['silverstitch', 'the statue moved again'],
  ['pixelpines', 'the lights in the hallway flickered'], ['cloudberrytv', 'hallway lights just flickered'], ['synthsailor', 'lights flickered again'], ['littlecomet', 'the hallway lights'], ['rippleframe', 'hallway lights flickered again'],
  ['mossybyte', 'there is something behind the door'], ['orbitaltoast', 'something behind the door'], ['lunarloop', 'behind the door!!'], ['tidepool', 'something behind the door right now'], ['softreset', 'something is hiding behind that door'],
]

function snapshot() {
  return { ...engine.snapshot(), demoMode: demoState === 'running', demoState }
}
function emitState() { io.emit('signal:state', snapshot()) }
function consumeDemoLine() {
  const [viewer, text] = demoLines[demoIndex % demoLines.length]
  demoIndex += 1
  engine.ingest({ viewer, text, source: 'demo' })
}
function startDemoTimer() {
  if (demoTimer) clearInterval(demoTimer)
  demoTimer = setInterval(consumeDemoLine, 1800)
}

app.get('/api/status', (_req, res) => res.json(snapshot()))

app.post('/api/demo/start', (_req, res) => {
  if (demoState === 'stopped') { demoIndex = 0; demoState = 'running'; consumeDemoLine() }
  else if (demoState === 'paused') demoState = 'running'
  if (demoState === 'running') startDemoTimer()
  emitState()
  res.json({ demoState, demoMode: demoState === 'running' })
})
app.post('/api/demo/pause', (_req, res) => {
  if (demoTimer) clearInterval(demoTimer)
  demoTimer = null
  if (demoState === 'running') demoState = 'paused'
  emitState()
  res.json({ demoState, demoMode: false })
})
app.post('/api/demo/resume', (_req, res) => {
  if (demoState === 'paused') { demoState = 'running'; startDemoTimer() }
  emitState()
  res.json({ demoState, demoMode: demoState === 'running' })
})
app.post('/api/demo/stop', (_req, res) => {
  if (demoTimer) clearInterval(demoTimer)
  demoTimer = null
  demoState = 'stopped'
  emitState()
  res.json({ demoState, demoMode: false })
})
app.post('/api/demo/reset', (_req, res) => {
  if (demoTimer) clearInterval(demoTimer)
  demoTimer = null
  demoState = 'stopped'
  demoIndex = 0
  const state = engine.reset()
  emitState()
  res.json({ ...state, demoMode: false, demoState })
})

app.post('/api/threshold', (req, res) => res.json({ threshold: engine.setThreshold(req.body?.threshold) }))
app.post('/api/reset', (_req, res) => res.json(engine.reset()))
app.post('/api/signals/:id/:action', (req, res) => {
  const status = req.params.action === 'approve' ? 'approved' : req.params.action === 'dismiss' ? 'dismissed' : ''
  const cluster = engine.setStatus(req.params.id, status)
  return cluster ? res.json({ cluster }) : res.status(404).json({ error: 'Signal not found or action is invalid.' })
})

io.on('connection', (socket) => socket.emit('signal:state', snapshot()))
setInterval(emitState, 1000)
server.listen(port, () => console.log(`QUORUM demo API listening on http://localhost:${port}`))
