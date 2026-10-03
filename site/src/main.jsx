import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const REPO_URL = 'https://github.com/hanuma-svg/packet-logger-pox'
const SOURCE_URL = 'https://github.com/hanuma-svg/packet-logger-pox/blob/main/pack.py'

const stages = [
  { id: 'host', label: 'Host A', short: 'GENERATE', description: 'A simulated frame leaves the source host.' },
  { id: 'switch', label: 'OpenFlow switch', short: 'INGRESS', description: 'Browser model: the frame reaches the OpenFlow switch boundary.' },
  { id: 'packetin', label: 'PacketIn', short: 'EVENT', description: 'The _handle_PacketIn listener method receives the OpenFlow event.' },
  { id: 'parse', label: 'Packet parse', short: 'PARSE', description: 'pack.py reads event.parsed and checks the packet object.' },
  { id: 'headers', label: 'Header extract', short: 'FIELDS', description: 'Ethernet and IPv4 fields are inspected when present.' },
  { id: 'protocol', label: 'Protocol detect', short: 'IDENTIFY', description: 'The IPv4 payload is matched to ICMP, TCP, UDP, or OTHER.' },
  { id: 'log', label: 'Log packet', short: 'LOG', description: 'The controller emits the packet details through its POX logger.' },
  { id: 'learn', label: 'MAC learning', short: 'LEARN', description: 'The source MAC is stored against event.port in mac_to_port.' },
  { id: 'decision', label: 'Output-port decision', short: 'DECIDE', description: 'The destination MAC selects a learned port, or the implementation selects OFPP_FLOOD.' },
  { id: 'packetout', label: 'ofp_packet_out() construction', short: 'BUILD', description: 'pack.py creates an output message, copies event.ofp, and appends an output action.' },
  { id: 'send', label: 'event.connection.send(msg)', short: 'SEND', description: 'The constructed packet-out message is sent back through the switch connection.' },
  { id: 'forward', label: 'Forward / flood', short: 'EGRESS', description: 'The controller sends the output action through event.connection; delivery is not verified by this module.' }
]

const packetSamples = [
  {
    protocol: 'TCP',
    tag: 'IPv4 / TCP',
    srcMac: '00:00:00:00:00:01',
    dstMac: '00:00:00:00:00:02',
    srcIp: '10.0.0.1',
    dstIp: '10.0.0.2',
    transport: 'TCP',
    etherType: '0x0800',
    action: 'FLOOD',
    note: 'Recognized by packet.find(\'tcp\') after IPv4 is found.'
  },
  {
    protocol: 'ICMP',
    tag: 'IPv4 / ICMP',
    srcMac: '00:00:00:00:00:01',
    dstMac: '00:00:00:00:00:02',
    srcIp: '10.0.0.1',
    dstIp: '10.0.0.2',
    transport: 'ICMP',
    etherType: '0x0800',
    action: 'FLOOD',
    note: 'Recognized by packet.find(\'icmp\') after IPv4 is found.'
  },
  {
    protocol: 'UDP',
    tag: 'IPv4 / UDP',
    srcMac: '00:00:00:00:00:02',
    dstMac: '00:00:00:00:00:01',
    srcIp: '10.0.0.2',
    dstIp: '10.0.0.1',
    transport: 'UDP',
    etherType: '0x0800',
    action: 'FORWARD',
    note: 'Recognized by packet.find(\'udp\'); the site labels this sample FORWARD to illustrate the learned-port branch.'
  },
  {
    protocol: 'OTHER',
    tag: 'IPv4 / OTHER',
    srcMac: '00:00:00:00:00:03',
    dstMac: '00:00:00:00:00:02',
    srcIp: '10.0.0.3',
    dstIp: '10.0.0.2',
    transport: 'OTHER',
    etherType: '0x0800',
    action: 'FLOOD',
    note: 'An IPv4 packet with no ICMP, TCP, or UDP payload match.'
  }
]

const protocolCards = [
  { name: 'IPv4', kind: 'network', code: 'ipv4', text: 'The IP layer is found and its source/destination addresses are logged.' },
  { name: 'TCP', kind: 'transport', code: 'tcp', text: 'Detected after IPv4 when packet.find(\'tcp\') returns a payload.' },
  { name: 'ICMP', kind: 'transport', code: 'icmp', text: 'Detected first in the transport checks after IPv4 is found.' },
  { name: 'UDP', kind: 'transport', code: 'udp', text: 'Detected after ICMP and TCP checks in the implementation.' },
  { name: 'OTHER', kind: 'fallback', code: 'else', text: 'The IPv4 fallback when no ICMP, TCP, or UDP payload is found.' }
]

const architecture = [
  { id: 'app', kicker: 'APPLICATION', title: 'Packet Logger', detail: 'The Python POX module registers PacketLogger and emits packet details through POX logging.' },
  { id: 'pox', kicker: 'CONTROL PLANE', title: 'POX Controller', detail: 'The POX listener method _handle_PacketIn receives the event object and runs the packet-processing logic.' },
  { id: 'openflow', kicker: 'CONTROL LINK', title: 'OpenFlow', detail: 'The module uses POX\'s OpenFlow event and message API for the parsed event and packet-out message.' },
  { id: 'ovs', kicker: 'DATA PLANE CONTEXT', title: 'OpenFlow switch', detail: 'The browser visualization places a switch boundary around the event and output action; pack.py does not name or configure a specific switch implementation.' },
  { id: 'hosta', kicker: 'ENDPOINT', title: 'Host A', detail: 'The source endpoint used in this browser visualization; the repository does not define a Mininet topology.' },
  { id: 'hostb', kicker: 'ENDPOINT', title: 'Host B', detail: 'The destination endpoint used in this browser visualization; no live traffic is connected.' }
]

const codeSnippets = [
  {
    label: '01 / PacketIn handler',
    title: 'Listener registration + parsed packet access',
    language: 'python',
    lines: [
      'def __init__(self):',
      '    core.openflow.addListeners(self)',
      '    self.mac_to_port = {}   # Learning switch table',
      '',
      'def _handle_PacketIn(self, event):',
      '    packet = event.parsed',
      '',
      '    if not packet:',
      '        return'
    ],
    explanation: 'The module subscribes the PacketLogger instance to POX OpenFlow events, then uses the parsed packet attached to the event. Unparsed events stop here.'
  },
  {
    label: '02 / Inspection',
    title: 'Ethernet, IPv4, and protocol detection',
    language: 'python',
    lines: [
      "log.info(\"Ethernet: %s -> %s\", packet.src, packet.dst)",
      '',
      "ip = packet.find('ipv4')",
      'if ip:',
      '    log.info("IP: %s -> %s", ip.srcip, ip.dstip)',
      '',
      "    if packet.find('icmp'):",
      '        log.info("Protocol: ICMP")',
      "    elif packet.find('tcp'):",
      '        log.info("Protocol: TCP")',
      "    elif packet.find('udp'):",
      '        log.info("Protocol: UDP")',
      '    else:',
      '        log.info("Protocol: OTHER")'
    ],
    explanation: 'Ethernet addresses are logged for every parsed packet. IP and protocol lines are inside the IPv4 branch; ARP is not inspected by this code path.'
  },
  {
    label: '03 / Egress decision',
    title: 'Learn, forward, or flood',
    language: 'python',
    lines: [
      'self.mac_to_port[packet.src] = event.port',
      '',
      'if packet.dst in self.mac_to_port:',
      '    out_port = self.mac_to_port[packet.dst]',
      'else:',
      '    out_port = of.OFPP_FLOOD',
      '',
      'msg = of.ofp_packet_out()',
      'msg.data = event.ofp',
      'msg.actions.append(of.ofp_action_output(port=out_port))',
      'event.connection.send(msg)'
    ],
    explanation: 'The source MAC is learned on the ingress port. A known destination is unicast; an unknown destination gets OFPP_FLOOD, then the original event data is sent back through the switch.'
  }
]

function App() {
  const [packet, setPacket] = useState(packetSamples[0])
  const [activeStage, setActiveStage] = useState(-1)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [logs, setLogs] = useState([])
  const [packetCount, setPacketCount] = useState(0)
  const [counts, setCounts] = useState({ TCP: 0, ICMP: 0, UDP: 0, OTHER: 0 })
  const [selectedProtocol, setSelectedProtocol] = useState('TCP')
  const [selectedArchitecture, setSelectedArchitecture] = useState('pox')
  const [selectedSnippet, setSelectedSnippet] = useState(0)
  const [copyState, setCopyState] = useState('')
  const [completed, setCompleted] = useState(false)
  const timerRef = useRef(null)
  const stageRef = useRef(-1)
  const sampleRef = useRef(packetSamples[0])
  const loggedRef = useRef(false)
  const logEndRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  useEffect(() => {
    if (logs.length) logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [logs.length])

  const addLog = useCallback((sample) => {
    const now = new Date()
    const stamp = now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
    const row = { id: `${Date.now()}-${Math.random()}`, stamp, sample }
    setLogs((current) => [...current.slice(-7), row])
    setPacketCount((current) => current + 1)
    setCounts((current) => ({ ...current, [sample.protocol]: current[sample.protocol] + 1 }))
    setSelectedProtocol(sample.protocol)
  }, [])

  const runTimer = useCallback(() => {
    clearTimer()
    setRunning(true)
    timerRef.current = window.setInterval(() => {
      const nextStage = Math.min(stageRef.current + 1, stages.length - 1)
      stageRef.current = nextStage
      setActiveStage(nextStage)
      if (nextStage === 6 && !loggedRef.current) {
        loggedRef.current = true
        addLog(sampleRef.current)
      }
      if (nextStage >= stages.length - 1) {
        clearTimer()
        setRunning(false)
        setCompleted(true)
      }
    }, 430)
  }, [addLog, clearTimer])

  const startSimulation = useCallback((sample = packetSamples[Math.floor(Math.random() * packetSamples.length)]) => {
    if (paused) return
    clearTimer()
    sampleRef.current = sample
    stageRef.current = 0
    loggedRef.current = false
    setPacket(sample)
    setSelectedProtocol(sample.protocol)
    setActiveStage(0)
    setCompleted(false)
    runTimer()
  }, [clearTimer, paused, runTimer])

  const handleGenerate = () => startSimulation()
  const handleDemo = () => startSimulation(packet)
  const handleFlow = () => startSimulation(packet)

  const togglePause = () => {
    if (!paused) {
      clearTimer()
      setRunning(false)
      setPaused(true)
      return
    }
    setPaused(false)
    if (stageRef.current >= 0 && stageRef.current < stages.length - 1) runTimer()
  }

  const clearLogs = () => {
    setLogs([])
    setPacketCount(0)
    setCounts({ TCP: 0, ICMP: 0, UDP: 0, OTHER: 0 })
    setCompleted(false)
  }

  const copyCommand = async (value, id) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState(id)
      window.setTimeout(() => setCopyState(''), 1500)
    } catch {
      setCopyState('failed')
    }
  }

  const packetProgress = activeStage < 0 ? -10 : Math.min(94, activeStage * (94 / (stages.length - 1)))
  const currentStage = activeStage >= 0 ? stages[activeStage] : null
  const currentProtocol = useMemo(() => protocolCards.find((item) => item.name === selectedProtocol) || protocolCards[0], [selectedProtocol])
  const selectedArch = architecture.find((item) => item.id === selectedArchitecture) || architecture[1]
  const selectedCode = codeSnippets[selectedSnippet]

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Packet Logger home">
          <span className="wordmark-mark"><i /><i /><i /></span>
          <span><b>PACKET</b><small>/ LOGGER</small></span>
        </a>
        <div className="topbar-status"><span className="status-dot" /> BROWSER SIMULATION <span className="status-divider" /> SOURCE VERIFIED</div>
        <nav className="topnav" aria-label="Primary navigation">
          <a href="#logger">Logger</a>
          <a href="#inspection">Inspect</a>
          <a href="#architecture">Architecture</a>
          <a href="#source">Source</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <div className="eyebrow"><span>01</span> PACKET PATH / POX OPENFLOW</div>
            <h1>Packet Logger <em>—</em><br /><span>POX SDN Controller</span></h1>
            <p className="hero-lede">Packet inspection and protocol logging in a Software Defined Network.</p>
            <p className="hero-note"><span className="note-mark">!</span> This page visualizes the behavior of <code>pack.py</code> in a browser. It is not connected to a live POX, Mininet, or Open vSwitch process.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={handleDemo}><span className="play">▶</span> Run Demonstration</button>
              <a className="button button-ghost" href={SOURCE_URL} target="_blank" rel="noreferrer">View Source Code <span>↗</span></a>
            </div>
          </div>
          <div className="hero-meta">
            <div className="meta-cell"><span>MODULE</span><strong>pack.py</strong></div>
            <div className="meta-cell"><span>EVENT</span><strong>PacketIn</strong></div>
            <div className="meta-cell"><span>OUTPUT</span><strong>packet_out</strong></div>
            <div className="meta-cell"><span>FALLBACK</span><strong>OFPP_FLOOD</strong></div>
          </div>

          <div className="topology-panel panel" aria-label="Animated packet path">
            <div className="panel-head">
              <div><span className="panel-kicker">SIMULATED PATH VIEW</span><h2>Host A <span>→</span> POX <span>→</span> Host B</h2></div>
              <div className="panel-readout"><span className="pulse-line" /> {running ? 'PROCESSING FRAME' : completed ? 'FRAME COMPLETE' : 'IDLE / READY'}</div>
            </div>
            <div className="topology-scroll">
              <div className="topology-lane">
                <div className="route-line route-a" /><div className="route-line route-b" /><div className="route-line route-c" />
                <div className="packet-token" style={{ left: `${packetProgress}%` }} aria-hidden="true"><span>◆</span></div>
                <TopologyNode type="host" title="Host A" subtitle="SOURCE" active={activeStage === 0} />
                <TopologyNode type="switch" title="OpenFlow switch" subtitle="VISUAL CONTEXT" active={activeStage === 1 || activeStage === 10} />
                <TopologyNode type="pox" title="POX Controller" subtitle={activeStage >= 2 ? 'PACKETIN → EGRESS' : 'CONTROL PLANE'} active={activeStage >= 2 && activeStage <= 9} />
                <TopologyNode type="host" title="Host B" subtitle="DESTINATION" active={activeStage === 10} />
              </div>
            </div>
            <div className="topology-footer">
              <div className="path-state"><span className="state-index">{completed ? 'DONE' : currentStage ? currentStage.short : 'READY'}</span><span>{completed ? 'Packet successfully processed.' : currentStage ? currentStage.description : 'Generate a packet to watch the event move through the path.'}</span></div>
              <div className="path-legend"><span><i className="legend-dot cyan" /> active path</span><span><i className="legend-dot amber" /> simulated</span></div>
            </div>
          </div>
        </section>

        <section className="section-wrap section" id="logger">
          <SectionIntro index="02" label="EVENT STREAM" title="Simulated Packet Logger" description="Generate a synthetic frame and follow the same fields that the controller inspects in `_handle_PacketIn`." />
          <div className="logger-grid">
            <div className="logger-workspace panel">
              <div className="workspace-toolbar">
                <div className="live-label"><span className="status-dot" /> SIMULATED PACKET LOGGER</div>
                <div className="toolbar-actions"><button className="mini-button" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button><button className="mini-button danger" onClick={clearLogs}>Clear logs</button></div>
              </div>
              <div className="logger-stats">
                <Stat value={packetCount} label="PACKETS" />
                <Stat value={counts.TCP} label="TCP" accent="cyan" />
                <Stat value={counts.ICMP} label="ICMP" accent="mint" />
                <Stat value={counts.UDP} label="UDP" accent="amber" />
                <Stat value={counts.OTHER} label="OTHER" accent="muted" />
              </div>
              <div className="log-console" aria-live="polite">
                <div className="console-head"><span>POX LOGGER / STDOUT</span><span>BUFFER {logs.length}/08</span></div>
                {logs.length === 0 ? <div className="empty-console"><span className="empty-glyph">∿</span><p>No packet events yet.</p><small>Generate Packet to begin the browser-only trace.</small></div> : logs.map((row) => <LogRow key={row.id} row={row} />)}
                <div ref={logEndRef} />
              </div>
              <div className="logger-footer"><button className="button button-primary" onClick={handleGenerate} disabled={running || paused}><span>＋</span> Generate Packet</button><span className="footer-note">{paused ? 'LOGGER PAUSED' : 'SIMULATED PACKETS / NO LIVE SOCKET'}</span></div>
            </div>
            <aside className="logger-aside">
              <div className="aside-label">CURRENT FRAME</div>
              <div className="frame-id">{packet.tag}</div>
              <div className="frame-summary"><span className="protocol-badge">{packet.protocol}</span><p>{packet.note}</p></div>
              <div className="field-list">
                <Field label="SRC MAC" value={packet.srcMac} />
                <Field label="DST MAC" value={packet.dstMac} />
                <Field label="SRC IP" value={packet.srcIp} />
                <Field label="DST IP" value={packet.dstIp} />
                <Field label="ACTION" value={packet.action} accent />
              </div>
              <div className="aside-warning"><span>!</span><p><strong>ARP note</strong>The README lists ARP, but `pack.py` does not call `packet.find('arp')` or log ARP details. This demo stays with the implemented IPv4 branches.</p></div>
            </aside>
          </div>
        </section>

        <section className="section-wrap section" id="inspection">
          <SectionIntro index="03" label="FIELD TRACE" title="Packet Inspection" description="The parsed object is traversed from Ethernet into IPv4 and then into a recognized transport payload." />
          <div className="inspection-grid">
            <div className="packet-tree panel">
              <div className="panel-head compact"><div><span className="panel-kicker">PARSED PACKET OBJECT</span><h2>Header map</h2></div><span className="tiny-status">{running ? 'TRACING' : 'SELECT A PROTOCOL'}</span></div>
              <InspectionRow icon="◇" label="Ethernet frame" value={packet.etherType === '0x0800' ? '0x0800 / IPv4' : packet.etherType} active={activeStage >= 3} />
              <div className="tree-indent"><InspectionRow icon="↳" label="Source MAC" value={packet.srcMac} active={activeStage >= 4} /><InspectionRow icon="↳" label="Destination MAC" value={packet.dstMac} active={activeStage >= 4} /></div>
              <InspectionRow icon="◇" label="Payload" value={packet.protocol === 'OTHER' ? 'IPv4 / unclassified' : 'IPv4'} active={activeStage >= 3} />
              <div className="tree-indent"><InspectionRow icon="↳" label="Source IP" value={packet.srcIp} active={activeStage >= 4} /><InspectionRow icon="↳" label="Destination IP" value={packet.dstIp} active={activeStage >= 4} /><InspectionRow icon="↳" label="Transport protocol" value={packet.transport} active={activeStage >= 5} accent /></div>
              <div className="tree-caption"><span className="caption-line" /> Field emphasis follows the running simulation.</div>
            </div>
            <div className="protocol-workspace">
              <div className="protocol-grid">{protocolCards.map((card) => <button key={card.name} className={`protocol-card ${selectedProtocol === card.name ? 'selected' : ''}`} onClick={() => setSelectedProtocol(card.name)}><span className={`protocol-icon ${card.kind}`}>{card.name === 'OTHER' ? '···' : card.name.slice(0, 2)}</span><span><strong>{card.name}</strong><small>{card.kind}</small></span><span className="card-arrow">↗</span></button>)}</div>
              <div className="detected panel"><div className="detected-kicker">DETECTED PROTOCOL <span>↓</span></div><div className="detected-value">{currentProtocol.name}</div><p>{currentProtocol.text}</p><div className="detected-code">{currentProtocol.name === 'OTHER' ? <>else <i>→</i> fallback branch</> : <><span>find</span>('{currentProtocol.code}') <i>→</i> payload match</>}</div></div>
              <button className="flow-link" onClick={handleFlow}><span>Run Packet Flow</span><span>↗</span></button>
            </div>
          </div>
        </section>

        <section className="section-wrap section stage-section">
          <div className="stage-intro"><div className="eyebrow"><span>04</span> PACKETIN EXPLAINER</div><h2>What happens when a packet reaches the switch?</h2><p>One event, twelve observable beats. Run the flow to map the browser animation to the actual control path.</p><button className="button button-primary" onClick={handleFlow} disabled={running}><span className="play">▶</span> {running ? 'Flow running…' : 'Run Packet Flow'}</button><div className={`completion-status ${completed ? 'visible' : ''}`} aria-live="polite">{completed && <><span>✓</span><strong>Packet successfully processed.</strong></>}</div></div>
          <div className="stage-rail">{stages.map((stage, index) => <div className={`stage-item ${activeStage === index ? 'active' : ''} ${activeStage > index ? 'done' : ''}`} key={stage.id}><div className="stage-node">{activeStage > index ? '✓' : String(index + 1).padStart(2, '0')}</div><div><span>{stage.short}</span><strong>{stage.label}</strong></div></div>)}</div>
        </section>

        <section className="section-wrap section" id="architecture">
          <SectionIntro index="05" label="CONTROL / DATA PLANE" title="SDN Architecture" description="Click a component to inspect its role. The diagram explains the system boundary; the animation above is the browser layer." />
          <div className="architecture-layout">
            <div className="architecture-map panel">
              <button className={`arch-card app ${selectedArchitecture === 'app' ? 'selected' : ''}`} onClick={() => setSelectedArchitecture('app')}><span>APPLICATION</span><strong>Packet Logger</strong><small>Python / POX module</small></button>
              <div className="arch-link vertical"><span>listener</span></div>
              <button className={`arch-card pox ${selectedArchitecture === 'pox' ? 'selected' : ''}`} onClick={() => setSelectedArchitecture('pox')}><span>CONTROL PLANE</span><strong>POX Controller</strong><small>PacketIn handler</small></button>
              <div className="arch-link vertical"><span>OpenFlow</span></div>
              <button className={`arch-card ovs ${selectedArchitecture === 'ovs' ? 'selected' : ''}`} onClick={() => setSelectedArchitecture('ovs')}><span>DATA PLANE CONTEXT</span><strong>OpenFlow switch</strong><small>event / output boundary</small></button>
              <div className="host-pair"><button className={`arch-card host ${selectedArchitecture === 'hosta' ? 'selected' : ''}`} onClick={() => setSelectedArchitecture('hosta')}><span>ENDPOINT</span><strong>Host A</strong><small>source</small></button><div className="branch-line"><span>↙</span><span>↘</span></div><button className={`arch-card host ${selectedArchitecture === 'hostb' ? 'selected' : ''}`} onClick={() => setSelectedArchitecture('hostb')}><span>ENDPOINT</span><strong>Host B</strong><small>destination</small></button></div>
            </div>
            <aside className="architecture-detail panel"><div className="panel-kicker">SELECTED COMPONENT</div><div className="detail-index">{selectedArch.id.toUpperCase()}</div><h3>{selectedArch.title}</h3><p>{selectedArch.detail}</p><div className="detail-rule" /><span className="detail-tag">{selectedArch.kicker}</span><div className="architecture-note"><span>↳</span> The repository does not include a topology file, so Host A / Host B are explanatory visualization endpoints.</div></aside>
          </div>
        </section>

        <section className="section-wrap section reality-section">
          <div className="reality-head"><div className="eyebrow"><span>06</span> BOUNDARY CHECK</div><h2>Actual project <em>vs</em> website demonstration</h2></div>
          <div className="reality-grid"><div className="reality-card actual"><div className="reality-label"><span className="label-dot" /> ACTUAL PROJECT</div><h3>POX + OpenFlow</h3><p>The GitHub repository contains a Python POX module with a PacketIn listener, Ethernet/IPv4 inspection, ICMP/TCP/UDP detection, MAC learning, and forwarding or flooding.</p><div className="reality-list"><span>✓ <b>pack.py</b> source</span><span>✓ <b>event.parsed</b> access</span><span>✓ <b>ofp_packet_out</b> output</span></div></div><div className="reality-card demo"><div className="reality-label"><span className="label-dot amber-dot" /> WEBSITE DEMONSTRATION</div><h3>Browser-only trace</h3><p>The controls generate synthetic packet objects, animate the path, and write illustrative log rows. No browser packet is delivered to the actual controller.</p><div className="reality-list"><span>→ simulated packet animation</span><span>→ interactive field highlights</span><span>→ teaching-oriented log stream</span></div></div></div>
        </section>

        <section className="section-wrap section source-section" id="source">
          <SectionIntro index="07" label="SOURCE NOTES" title="How the Packet Logger works" description="Selected lines below are copied from the actual repository. Choose a slice of the controller to see what it does and what the browser is modeling." />
          <div className="source-layout">
            <div className="snippet-tabs">{codeSnippets.map((snippet, index) => <button key={snippet.label} className={selectedSnippet === index ? 'selected' : ''} onClick={() => setSelectedSnippet(index)}><span>{snippet.label}</span><strong>{snippet.title}</strong><i>↗</i></button>)}</div>
            <div className="code-panel panel"><div className="code-toolbar"><span><i className="code-dot red" /><i className="code-dot yellow" /><i className="code-dot green" /> pack.py</span><span>{selectedCode.language} / source excerpt</span></div><pre>{selectedCode.lines.map((line, index) => <code key={`${index}-${line}`} className={line.includes('PacketIn') || line.includes('packet.find') || line.includes('OFPP_FLOOD') || line.includes('packet_out') || line.includes('send(msg)') ? 'highlight-code' : ''}><span className="line-no">{String(index + 1).padStart(2, '0')}</span>{line || ' '}</code>)}</pre><div className="code-explanation"><span>WHY IT MATTERS</span><p>{selectedCode.explanation}</p></div></div>
          </div>
        </section>

        <section className="section-wrap section run-section" id="run">
          <div className="run-copy"><div className="eyebrow"><span>08</span> REPRODUCE THE CONTEXT</div><h2>Run It Yourself</h2><p>The repository is a POX module, not a self-contained topology. Use the verified checkout command below, then load <code>pack.py</code> inside your own POX/OpenFlow environment.</p><div className="prereq-row"><span>Python</span><span>POX</span><span>OpenFlow switch</span><span>Linux environment</span></div><div className="run-warning"><span>!</span><p><strong>No topology command in repository.</strong> There is no Mininet file or documented controller launch command in the current repository, so this site does not invent one.</p></div></div>
          <div className="command-stack"><CommandBlock id="clone" label="REPOSITORY CHECKOUT" command="git clone https://github.com/hanuma-svg/packet-logger-pox.git" copyState={copyState} onCopy={copyCommand} /><CommandBlock id="source" label="MODULE SOURCE" command="https://github.com/hanuma-svg/packet-logger-pox/blob/main/pack.py" copyState={copyState} onCopy={copyCommand} link={SOURCE_URL} /></div>
        </section>
      </main>

      <footer className="footer section-wrap"><div className="footer-brand"><span className="wordmark-mark"><i /><i /><i /></span><span>PACKET LOGGER / POX</span></div><p>Source-grounded browser demo · README + pack.py · no live controller bridge</p><div className="footer-links"><a href={REPO_URL} target="_blank" rel="noreferrer">GitHub Repository ↗</a><a href={SOURCE_URL} target="_blank" rel="noreferrer">pack.py ↗</a></div></footer>
    </div>
  )
}

function TopologyNode({ type, title, subtitle, active }) {
  return <div className={`topology-node ${type} ${active ? 'active' : ''}`}><div className="node-icon">{type === 'host' ? '▣' : type === 'switch' ? '⊞' : '⌘'}</div><strong>{title}</strong><span>{subtitle}</span></div>
}

function SectionIntro({ index, label, title, description }) {
  return <div className="section-intro"><div className="eyebrow"><span>{index}</span> {label}</div><h2>{title}</h2><p>{description}</p></div>
}

function Stat({ value, label, accent }) {
  return <div className={`stat ${accent || ''}`}><strong>{value}</strong><span>{label}</span></div>
}

function Field({ label, value, accent }) {
  return <div className={`field ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function LogRow({ row }) {
  return <div className="log-row"><div className="log-time">[{row.stamp}]</div><div className="log-detail"><strong>PACKET_IN <i>{row.sample.protocol}</i></strong><span>{row.sample.srcMac} <b>→</b> {row.sample.dstMac}</span><span>{row.sample.srcIp} <b>→</b> {row.sample.dstIp}</span><span>PROTOCOL: {row.sample.protocol} <b>·</b> ACTION: {row.sample.action}</span></div></div>
}

function InspectionRow({ icon, label, value, active, accent }) {
  return <div className={`inspection-row ${active ? 'active' : ''} ${accent ? 'accent' : ''}`}><span className="inspect-icon">{icon}</span><span className="inspect-label">{label}</span><strong>{value}</strong><span className="row-mark">{active ? '●' : '○'}</span></div>
}

function CommandBlock({ label, command, id, copyState, onCopy, link }) {
  return <div className="command-block"><div className="command-label">{label}<button onClick={() => onCopy(command, id)}>{copyState === id ? 'Copied' : 'Copy command'}</button></div><div className="command-code"><code>{command}</code>{link && <a href={link} target="_blank" rel="noreferrer">↗</a>}</div></div>
}

createRoot(document.getElementById('root')).render(<App />)
