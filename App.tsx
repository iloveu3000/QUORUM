import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import GlassPill from './components/GlassPill'

type Message = { id: string; viewer: string; text: string; source: 'demo'; timestamp: number; countedAsContributor?: boolean; sharedTerms?: string[]; matchScore?: number }
type Cluster = { id: string; title: string; source: 'demo'; firstSeen: number; lastSeen: number; messages: Message[]; viewers: string[]; uniqueViewers: number; score: number; quorum: boolean; status: string; announcedAt: number | null; matchReason?: string; lastTriggeredAt?: number | null; cooldownUntil?: number | null }
type State = { threshold: number; clusters: Cluster[]; messages: Message[]; discoveries: Cluster[]; demoMode?: boolean; demoState?: 'stopped' | 'running' | 'paused' }

const initialState: State = { threshold: 5, clusters: [], messages: [], discoveries: [] }
const timeLabel = (timestamp: number) => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(timestamp))
const ageLabel = (timestamp: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`
}

async function api(path: string, body?: unknown) {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.')
  return data
}

function Brand() {
  return <div className="brand"><div className="brand-symbol"><span /><span /><span /></div><div><strong>QUORUM</strong><small>COLLECTIVE SIGNAL</small></div></div>
}

function NavRail() {
  return <aside className="rail"><Brand /><div className="rail-divider" /><a className="rail-item is-active" href="#pulse" aria-label="Demo pulse"><span className="rail-wave">⌁</span></a><a className="rail-item" href="#signals" aria-label="Signal clusters">◉</a><a className="rail-item" href="#discoveries" aria-label="Discoveries">✳</a><div className="rail-bottom"><span className="avatar">Q</span></div></aside>
}

function Header({ demoMode, demoState }: { demoMode: boolean; demoState: string }) {
  const label = demoMode ? 'DEMO DATA · RUNNING' : demoState === 'paused' ? 'DEMO DATA · PAUSED' : 'DEMO DATA · READY'
  return <header className="topbar"><div className="breadcrumb"><span>WORKSPACE</span><b>/</b><strong>Collective intelligence</strong></div><div className="topbar-right"><span className="connection-chip"><i />{label}</span>{demoMode && <span className="demo-chip">DEMO MODE</span>}<a className="overlay-link" href="/overlay" target="_blank" rel="noreferrer">▣ <span>OBS overlay</span></a></div></header>
}

function DiscoveryCard({ cluster, onAction }: { cluster: Cluster; onAction: (id: string, action: 'approve' | 'dismiss') => void }) {
  const samples = cluster.messages
  return <article className="discovery-card">
    <div className="discovery-top"><span className="discovery-eyebrow"><span className="spark">✳</span> DEMO DATA · QUORUM REACHED <i className={`source-badge ${cluster.source}`}>SIMULATED</i></span><span className="discovery-age">{ageLabel(cluster.announcedAt || cluster.lastSeen)}</span></div>
    <h3>{cluster.title}</h3>
    <div className="discovery-meta"><span className="viewer-dots">{cluster.viewers.slice(0, 4).map((viewer) => <i key={viewer}>{viewer.slice(0, 1).toUpperCase()}</i>)}{cluster.viewers.length > 4 && <i>+{cluster.viewers.length - 4}</i>}</span><strong>{cluster.uniqueViewers} unique simulated viewers</strong><span className="meta-dot">·</span><span>{cluster.messages.length} demo signals</span></div>
    <div className="quote-stack">{samples.map((message) => <p key={message.id}><span>{message.viewer}</span><b>{message.text}</b><i>DEMO DATA · SIMULATED VIEWER</i><i>{message.countedAsContributor === false ? 'REPEAT · NOT COUNTED' : 'CONTRIBUTOR'}</i></p>)}</div>
    <div className="evidence-note">{cluster.matchReason} · Rolling window: 30 seconds · Last triggered: {cluster.lastTriggeredAt ? timeLabel(cluster.lastTriggeredAt) : 'not triggered'}</div>
    {cluster.status === 'discovered' ? <div className="discovery-actions"><GlassPill label="Approve discovery" size="sm" onClick={() => onAction(cluster.id, 'approve')} /><GlassPill label="Dismiss" size="sm" onClick={() => onAction(cluster.id, 'dismiss')} /></div> : <div className={`moderation-state ${cluster.status}`}>{cluster.status === 'approved' ? '✓ Approved by streamer' : 'Discovery dismissed'}</div>}
  </article>
}

function Dashboard() {
  const [state, setState] = useState(initialState)
  const [demoMode, setDemoMode] = useState(false)
  const [demoState, setDemoState] = useState<State['demoState']>('stopped')
  const [threshold, setThreshold] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const acceptState = useCallback((next: Partial<State>) => setState((current) => ({ ...current, ...next })), [])
  useEffect(() => {
    api('/status').then((data) => { acceptState(data); setDemoMode(data.demoMode); setDemoState(data.demoState || 'stopped'); setThreshold(data.threshold || 5) }).catch(() => undefined)
    const socket = io({ transports: ['websocket', 'polling'] })
    socket.on('signal:state', (data: State) => { acceptState(data); setDemoMode(Boolean(data.demoMode)); setDemoState(data.demoState || 'stopped'); setThreshold(data.threshold || 5) })
    socket.on('signal:update', (event: { state: State }) => acceptState(event.state))
    return () => { socket.disconnect() }
  }, [acceptState])

  const discoveries = useMemo(() => state.clusters.filter((item) => item.quorum && item.status !== 'cooldown').sort((a, b) => (b.announcedAt || b.lastSeen) - (a.announcedAt || a.lastSeen)), [state.clusters])
  const activeClusters = useMemo(() => state.clusters.filter((item) => !item.quorum || item.status === 'cooldown').slice(0, 5), [state.clusters])

  async function demoAction(action: 'start' | 'pause' | 'resume' | 'stop' | 'reset') {
    setBusy(true); setError('')
    try { const result = await api(`/demo/${action}`, {}); setDemoMode(result.demoMode); setDemoState(result.demoState); if (action === 'reset') acceptState(result) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not change demo mode.') }
    finally { setBusy(false) }
  }
  async function changeThreshold(value: number) {
    setThreshold(value)
    try { const result = await api('/threshold', { threshold: value }); acceptState({ threshold: result.threshold }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update quorum threshold.') }
  }
  async function moderate(id: string, action: 'approve' | 'dismiss') {
    try { await api(`/signals/${encodeURIComponent(id)}/${action}`, {}); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update the discovery.') }
  }
  async function resetSession() {
    try { const result = await api('/reset', {}); acceptState(result) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not reset the signal feed.') }
  }

  const viewerCount = new Set(state.messages.map((message) => message.viewer)).size
  return <div className="app-shell"><NavRail /><div className="main-column"><Header demoMode={demoMode} demoState={demoState || 'stopped'} /><main className="dashboard" id="pulse">
    <section className="hero-row"><div><div className="eyebrow"><span className="eyebrow-line" /> COLLECTIVE INTELLIGENCE / 01</div><h1>Notice the moment<br /><em>together.</em></h1><p className="hero-copy">A living pulse of what your community is seeing, feeling, and responding to.</p></div><div className="hero-orb" aria-hidden="true"><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /><div className="orb-core"><span>Q</span></div><i className="orbit-dot dot-one" /><i className="orbit-dot dot-two" /><i className="orbit-dot dot-three" /></div></section>

    <section className="control-panel glass-panel"><div className="control-heading"><div><span className="section-kicker">DEMO SIGNAL SOURCE</span><h2>Simulated viewer stream</h2></div><span className={`status-indicator ${demoMode ? 'is-on' : ''}`}><i />{demoMode ? 'Demo running' : demoState === 'paused' ? 'Demo paused' : 'Demo ready'}</span></div><div className="control-content"><div className="demo-controls"><GlassPill className="demo-button" label="◉ Start" size="sm" disabled={busy || demoState === 'running'} onClick={() => demoAction('start')} /><GlassPill className="demo-button" label={demoState === 'paused' ? 'Resume' : 'Pause'} size="sm" disabled={busy || (demoState !== 'running' && demoState !== 'paused')} onClick={() => demoAction(demoState === 'paused' ? 'resume' : 'pause')} /><GlassPill className="demo-button" label="Stop" size="sm" disabled={busy || demoState === 'stopped'} onClick={() => demoAction('stop')} /><GlassPill className="demo-button" label="Reset demo" size="sm" disabled={busy} onClick={() => demoAction('reset')} /></div><span className="demo-note">DEMO DATA · simulated chat and viewers</span></div>{error && <div className="error-note" role="alert">{error}</div>}<div className="control-foot"><span><i className="foot-pulse" /> All messages and viewers are simulated demo data</span><span className="secure-label">◈ &nbsp;LOCAL SIGNAL SIMULATION</span></div></section>

    {demoState !== 'stopped' && <div className="demo-banner"><span className="demo-banner-dot" /><div><strong>DEMO MODE {demoState === 'paused' ? 'PAUSED' : 'ACTIVE'}</strong><span>Simulated viewers and messages are clearly marked and flow through the same signal engine.</span></div><GlassPill label="Stop demo" size="sm" disabled={busy} onClick={() => demoAction('stop')} /></div>}

    <section className="metrics-row"><div className="metric"><span className="metric-label">UNIQUE DEMO VIEWERS</span><strong>{viewerCount.toString().padStart(2, '0')}</strong><span className="metric-sub">in rolling 30 seconds</span></div><div className="metric"><span className="metric-label">DEMO MESSAGES</span><strong>{state.messages.length.toString().padStart(2, '0')}</strong><span className="metric-sub">{state.messages.length} simulated messages</span></div><div className="metric"><span className="metric-label">DISCOVERIES</span><strong>{discoveries.length.toString().padStart(2, '0')}</strong><span className="metric-sub">quorum reached</span></div><div className="threshold-control"><label htmlFor="threshold"><span className="metric-label">QUORUM THRESHOLD</span><strong>{threshold}<small> viewers</small></strong></label><input id="threshold" type="range" min="2" max="12" value={threshold} onChange={(event) => changeThreshold(Number(event.target.value))} style={{ '--range-progress': `${((threshold - 2) / 10) * 100}%` } as React.CSSProperties} /><span className="range-foot"><span>2</span><span>12</span></span></div></section>

    <div className="content-grid"><div className="left-stack"><section className="feed-section" id="discoveries"><div className="section-heading"><div><span className="section-kicker">COORDINATED RESPONSE</span><h2>Discovery feed <span className="count-badge">{discoveries.length}</span></h2></div><div className="section-tools"><span className="rolling-label"><i /> ROLLING 30 SEC</span><GlassPill label="Reset" size="sm" onClick={resetSession} /></div></div>{discoveries.length ? <div className="discovery-list">{discoveries.map((cluster) => <DiscoveryCard key={cluster.id} cluster={cluster} onAction={moderate} />)}</div> : <div className="empty-discovery"><div className="empty-star">✳</div><div><strong>Waiting for a shared signal</strong><p>When {threshold} unique simulated viewers notice the same thing, it will surface here.</p></div><span className="empty-path">01 <b>—</b> 02 <b>—</b> 03</span></div>}</section>
    <section className="cluster-section" id="signals"><div className="section-heading"><div><span className="section-kicker">SIGNAL ACCUMULATION</span><h2>Building clusters <span className="count-badge">{activeClusters.length}</span></h2></div><span className="subtle-label">UNIQUE VIEWERS / CLUSTER</span></div>{activeClusters.length ? <div className="cluster-list">{activeClusters.map((cluster) => <article className="cluster-row" key={cluster.id}><div className="cluster-icon">⌁</div><div className="cluster-main"><strong>{cluster.title}{cluster.status === 'cooldown' ? ' · DISCOVERY COOLDOWN' : ''}</strong><span>{cluster.messages.length} messages · DEMO DATA · {ageLabel(cluster.firstSeen)}</span><span>Contributors: {cluster.viewers.join(', ') || 'none'} · {cluster.uniqueViewers} unique simulated viewers / rolling 30 seconds</span><span>{cluster.matchReason}</span><div className="cluster-evidence">{cluster.messages.map((message) => <p key={message.id}><b>@{message.viewer}</b> {message.text} <i>DEMO DATA · SIMULATED</i> <i>{message.countedAsContributor === false ? 'REPEAT · NOT COUNTED' : 'COUNTED'}</i><i>{message.sharedTerms?.length ? `MATCH: ${message.sharedTerms.join(', ')} · ${Math.round((message.matchScore || 0) * 100)}%` : 'SEED MESSAGE'}</i></p>)}</div>{cluster.lastTriggeredAt && <span>Last discovery: {timeLabel(cluster.lastTriggeredAt)}{cluster.cooldownUntil && ` · cooldown until ${timeLabel(cluster.cooldownUntil)}`}</span>}</div><div className="cluster-progress"><div className="progress-track"><i style={{ width: `${cluster.score}%` }} /></div><span>{cluster.uniqueViewers} / {threshold}</span></div><span className="cluster-score">{cluster.score}%</span></article>)}</div> : <div className="empty-clusters"><span>⌁</span><p>Chat messages gather into shared signals here.</p></div>}</section></div>

    <aside className="right-stack"><section className="chat-panel" id="chat"><div className="section-heading"><div><span className="section-kicker">DEMO CHAT DATA</span><h2>Simulated chat pulse</h2></div><span className="live-indicator"><i /> {demoMode ? 'DEMO' : demoState === 'paused' ? 'PAUSED' : 'IDLE'}</span></div><div className="chat-list">{state.messages.length ? state.messages.slice(0, 12).map((message) => <div className="chat-message" key={message.id}><span className="chat-avatar" style={{ '--avatar-hue': `${(message.viewer.length * 47) % 360}deg` } as React.CSSProperties}>{message.viewer.slice(0, 1).toUpperCase()}</span><div className="chat-body"><div><strong>{message.viewer}</strong><time>{timeLabel(message.timestamp)}</time></div><p>{message.text}</p><span className="source-tag">DEMO DATA · SIMULATED VIEWER</span></div></div>) : <div className="chat-empty"><span>···</span><strong>No messages yet</strong><p>Start demo mode to see simulated chat and viewer data.</p></div>}</div><div className="chat-foot"><span><i /> 30 SECOND WINDOW</span><span>{state.messages.length} messages</span></div></section>
    <section className="formula-card"><div className="formula-head"><span className="formula-icon">∑</span><div><span className="section-kicker">SIGNAL ENGINE</span><h3>How signal score works</h3></div></div><p>Each cluster counts unique simulated viewers in a rolling 30-second window. Repeat messages from the same viewer count once.</p><div className="formula-equation"><span>unique simulated viewers</span><b>÷</b><span>threshold</span><b>×</b><span>100</span><b>=</b><strong>score</strong></div><div className="formula-foot"><span><i /> capped at 100%</span><span>QUORUM AT {threshold}</span></div></section></aside></div>
    <footer className="page-footer"><span>QUORUM / COMMUNITY SIGNAL INTELLIGENCE</span><span>BUILT TO NOTICE TOGETHER <b>✳</b></span></footer>
  </main></div></div>
}

function Overlay() {
  const [state, setState] = useState(initialState)
  useEffect(() => {
    api('/status').then((data) => setState(data)).catch(() => undefined)
    const socket = io({ transports: ['websocket', 'polling'] })
    socket.on('signal:state', (data: State) => setState(data))
    socket.on('signal:update', (event: { state: State }) => setState(event.state))
    return () => { socket.disconnect() }
  }, [])
  const discovery = [...state.clusters].filter((cluster) => cluster.quorum && cluster.status !== 'dismissed' && cluster.status !== 'cooldown').sort((a, b) => (b.announcedAt || b.lastSeen) - (a.announcedAt || a.lastSeen))[0]
  return <div className="overlay-page">{discovery ? <div className="overlay-card"><div className="overlay-label"><span>✳</span> COMMUNITY DISCOVERY <span className="overlay-demo">DEMO DATA</span></div><h1>{discovery.title}</h1><div className="overlay-count"><span>{discovery.uniqueViewers}</span><span>unique simulated viewers noticed together</span></div><div className="overlay-progress"><i style={{ width: `${discovery.score}%` }} /></div><div className="overlay-caption">A simulated collective signal is forming</div></div> : <div className="overlay-idle"><div className="overlay-mark">Q</div><strong>QUORUM</strong><span>DEMO DATA · SIMULATED VIEWERS · WAITING FOR A SHARED SIGNAL</span></div>}</div>
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.toggle('overlay-mode', window.location.pathname === '/overlay')
    return () => document.documentElement.classList.remove('overlay-mode')
  }, [])
  return window.location.pathname === '/overlay' ? <Overlay /> : <Dashboard />
}
