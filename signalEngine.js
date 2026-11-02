const WINDOW_MS = 30_000
const STOP_WORDS = new Set('a an the and but you are was were for that this with have has had just its from they them what when where look there here lol omg wait chat did does do is it in on at to of by as be been'.split(' '))
const DEFAULT_COOLDOWN_MS = 60_000

export function normalizeTerms(text) {
  const words = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  return new Set(words.map(stem))
}
function stem(word) {
  if (['something', 'anything', 'nothing', 'everything'].includes(word)) return word
  if (word.length > 5 && word.endsWith('ing')) { let base = word.slice(0, -3); if (/(.)\1$/.test(base)) base = base.slice(0, -1); return /[vc]$/.test(base) ? `${base}e` : base }
  if (word.length > 4 && word.endsWith('ied')) return word.slice(0, -3) + 'y'
  if (word.length > 4 && word.endsWith('ed')) { let base = word.slice(0, -2); if (/(.)\1$/.test(base)) base = base.slice(0, -1); return /[vc]$/.test(base) ? `${base}e` : base }
  if (word.length > 4 && /(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}
function compare(left, right) {
  const a = normalizeTerms(left), b = normalizeTerms(right)
  const shared = [...a].filter((word) => b.has(word))
  const score = a.size && b.size ? shared.length / (a.size + b.size - shared.length) : 0
  return { score, shared, matches: score >= .28 && shared.length >= Math.min(1, Math.min(a.size, b.size)) }
}

export class SignalEngine {
  constructor({ threshold = 5, cooldownMs = Number(process.env.QUORUM_DISCOVERY_COOLDOWN_MS || DEFAULT_COOLDOWN_MS), onUpdate = () => {} } = {}) {
    this.threshold = Math.max(2, Number(threshold) || 5); this.cooldownMs = Math.max(0, Number(cooldownMs) || 0); this.onUpdate = onUpdate
    this.clusters = []; this.messages = []; this.cooldowns = []
  }
  prune(now = Date.now()) {
    const cutoff = now - 30_000
    this.messages = this.messages.filter((m) => m.timestamp >= cutoff)
    this.clusters = this.clusters.filter((c) => c.lastSeen >= cutoff)
    this.cooldowns = this.cooldowns.filter((entry) => entry.cooldownUntil > now)
    for (const c of this.clusters) {
      c.messages = c.messages.filter((m) => m.timestamp >= cutoff)
      c.viewers = [...new Set(c.messages.map((m) => m.viewer))]; c.uniqueViewers = c.viewers.length
      c.score = Math.min(100, Math.round(c.uniqueViewers / this.threshold * 100)); c.quorum = c.uniqueViewers >= this.threshold
    }
  }
  ingest({ viewer, text, source = 'demo', timestamp = Date.now() }) {
    if (!viewer || !text?.trim() || source !== 'demo') return null
    this.prune(timestamp)
    const message = { id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`, viewer: String(viewer).trim().toLowerCase(), text: text.trim(), source, timestamp, countedAsContributor: false, matchScore: 0, sharedTerms: [] }
    this.messages.unshift(message); this.messages = this.messages.slice(0, 100)
    const ranked = this.clusters.map((candidate) => {
      const comparisons = candidate.messages.map((m) => compare(m.text, message.text)).sort((a, b) => b.score - a.score)
      return { candidate, comparison: comparisons[0] || { score: 0, shared: [], matches: false } }
    }).filter(({ comparison }) => comparison.matches).sort((a, b) => b.comparison.score - a.comparison.score)[0]
    let cluster = ranked?.candidate
    if (!cluster) {
      cluster = { id: `signal-${timestamp}-${Math.random().toString(36).slice(2, 7)}`, source: 'demo', title: message.text.length > 46 ? `${message.text.slice(0, 43).trim()}…` : message.text, firstSeen: timestamp, lastSeen: timestamp, messages: [], viewers: [], uniqueViewers: 0, score: 0, quorum: false, status: 'watching', announcedAt: null, lastTriggeredAt: null, cooldownUntil: null, matchReason: 'New topic: no matching active demo topic found.' }
      this.clusters.unshift(cluster)
    } else {
      message.matchScore = Number(ranked.comparison.score.toFixed(2)); message.sharedTerms = ranked.comparison.shared
      cluster.matchReason = `Grouped by ${message.sharedTerms.length} shared normalized keyword(s): ${message.sharedTerms.join(', ')} (Jaccard ${Math.round(message.matchScore * 100)}%).`
    }
    message.countedAsContributor = !cluster.viewers.includes(message.viewer)
    cluster.messages.unshift(message); cluster.lastSeen = timestamp
    cluster.viewers = [...new Set(cluster.messages.map((m) => m.viewer))]; cluster.uniqueViewers = cluster.viewers.length
    cluster.score = Math.min(100, Math.round(cluster.uniqueViewers / this.threshold * 100)); cluster.quorum = cluster.uniqueViewers >= this.threshold
    if (cluster.quorum && !cluster.announcedAt) {
      const cooldown = this.cooldowns.find((entry) => compare(entry.title, cluster.title).matches)
      if (cooldown) { cluster.status = 'cooldown'; cluster.lastTriggeredAt = cooldown.lastTriggeredAt; cluster.cooldownUntil = cooldown.cooldownUntil }
      else { cluster.announcedAt = timestamp; cluster.lastTriggeredAt = timestamp; cluster.cooldownUntil = timestamp + this.cooldownMs; cluster.status = 'discovered'; this.cooldowns.push({ title: cluster.title, lastTriggeredAt: timestamp, cooldownUntil: cluster.cooldownUntil }) }
    }
    this.clusters = this.clusters.slice(0, 24)
    this.onUpdate({ message, cluster: this.serialize(cluster), state: this.snapshot() }); return cluster
  }
  setStatus(id, status) { const cluster = this.clusters.find((c) => c.id === id); if (!cluster || !['approved', 'dismissed'].includes(status)) return null; cluster.status = status; this.onUpdate({ type: 'status', cluster: this.serialize(cluster), state: this.snapshot() }); return this.serialize(cluster) }
  setThreshold(n) { this.threshold = Math.min(30, Math.max(2, Number(n) || 5)); this.prune(); this.onUpdate({ type: 'threshold', state: this.snapshot() }); return this.threshold }
  reset() { this.clusters = []; this.messages = []; this.cooldowns = []; this.onUpdate({ type: 'reset', state: this.snapshot() }); return this.snapshot() }
  serialize(c) { return { ...c, viewers: [...c.viewers], messages: c.messages.map((m) => ({ ...m, sharedTerms: [...m.sharedTerms] })) } }
  snapshot() { this.prune(); return { threshold: this.threshold, cooldownMs: this.cooldownMs, clusters: this.clusters.map((c) => this.serialize(c)), messages: this.messages.map((m) => ({ ...m, sharedTerms: [...m.sharedTerms] })), discoveries: this.clusters.filter((c) => c.quorum && c.status !== 'cooldown').map((c) => this.serialize(c)) } }
}
