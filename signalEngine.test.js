import test from 'node:test'
import assert from 'node:assert/strict'
import { SignalEngine, normalizeTerms } from './signalEngine.js'

const base = Date.now()
const viewers = ['one', 'two', 'three', 'four', 'five']
const topic = 'The statue moved in the hallway!'
function cast(engine, count, source = 'demo', start = base, phrase = topic) {
  let cluster
  for (let i = 0; i < count; i++) cluster = engine.ingest({ viewer: viewers[i], text: phrase, source, timestamp: start + i })
  return cluster
}

test('quorum requires five independent viewers; four do not reach it', () => {
  const engine = new SignalEngine({ threshold: 5, cooldownMs: 0 })
  assert.equal(cast(engine, 4).quorum, false)
  assert.equal(engine.clusters[0].uniqueViewers, 4)
  assert.equal(engine.ingest({ viewer: 'five', text: topic, source: 'demo', timestamp: base + 4 }).quorum, true)
})

test('one viewer repeated in a cluster is visible but counted once', () => {
  const engine = new SignalEngine({ threshold: 5 })
  engine.ingest({ viewer: 'one', text: topic, source: 'demo', timestamp: base })
  const repeated = engine.ingest({ viewer: 'one', text: topic, source: 'demo', timestamp: base + 1 })
  assert.equal(repeated.uniqueViewers, 1)
  assert.equal(repeated.messages[0].countedAsContributor, false)
  const caseVariant = engine.ingest({ viewer: 'ONE', text: topic, source: 'demo', timestamp: base + 2 })
  assert.equal(caseVariant.uniqueViewers, 1)
  assert.equal(caseVariant.messages[0].countedAsContributor, false)
})

test('the rolling window expires evidence after 30 seconds and allows a viewer to contribute again', () => {
  const engine = new SignalEngine({ threshold: 2 })
  engine.ingest({ viewer: 'one', text: topic, source: 'demo', timestamp: base })
  engine.ingest({ viewer: 'two', text: topic, source: 'demo', timestamp: base + 1 })
  engine.prune(base + 30_001)
  const next = engine.ingest({ viewer: 'one', text: topic, source: 'demo', timestamp: base + 30_002 })
  assert.equal(next.uniqueViewers, 1)
  assert.equal(next.messages[0].countedAsContributor, true)
})

test('the standalone engine accepts only demo data', () => {
  const engine = new SignalEngine({ threshold: 5, cooldownMs: 0 })
  cast(engine, 4)
  assert.equal(engine.ingest({ viewer: 'five', text: topic, source: 'live', timestamp: base + 10 }), null)
  assert.deepEqual(engine.clusters.map((c) => [c.source, c.uniqueViewers]), [['demo', 4]])
})

test('streamer approval and dismissal update discovery status without altering evidence', () => {
  const engine = new SignalEngine({ threshold: 2, cooldownMs: 0 })
  const cluster = cast(engine, 2)
  assert.equal(cluster.status, 'discovered')
  assert.equal(engine.setStatus(cluster.id, 'approved').status, 'approved')
  assert.equal(engine.setStatus(cluster.id, 'dismissed').status, 'dismissed')
  assert.equal(engine.clusters[0].messages.length, 2)
  assert.equal(engine.setStatus(cluster.id, 'banned'), null)
})

test('normalization groups punctuation, case, plurals and inflections but avoids one word matches', () => {
  assert.deepEqual([...normalizeTerms('STATUES moved!!!')], ['statue', 'move'])
  assert.deepEqual([...normalizeTerms('statue moving')], ['statue', 'move'])
  const engine = new SignalEngine()
  engine.ingest({ viewer: 'one', text: 'The statue just moved!', source: 'demo', timestamp: base })
  const grouped = engine.ingest({ viewer: 'two', text: 'statues are moving', source: 'demo', timestamp: base + 1 })
  assert.equal(engine.clusters.length, 1)
  assert.match(grouped.matchReason, /shared normalized keyword/)
  engine.ingest({ viewer: 'three', text: 'statue painting is beautiful', source: 'demo', timestamp: base + 2 })
  assert.equal(engine.clusters.length, 2)
})

test('cooldown survives the 30-second cluster window and suppresses the repeated topic', () => {
  const engine = new SignalEngine({ threshold: 2, cooldownMs: 120_000 })
  cast(engine, 2, 'demo', base, 'The statue moved in the hallway')
  const first = engine.clusters.find((c) => c.source === 'demo')
  assert.equal(first.status, 'discovered')
  engine.prune(base + 31_000)
  cast(engine, 2, 'demo', base + 32_000, 'statues are moving in hallway')
  assert.equal(engine.clusters.find((c) => c.source === 'demo').status, 'cooldown')
  const suppressed = cast(engine, 2, 'demo', base + 34_000, 'The statue moved in the hallway')
  assert.equal(suppressed.status, 'cooldown')
})
