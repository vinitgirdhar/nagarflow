'use client';
import { useState, useEffect, useRef } from 'react';
import DashboardShell from '../components/DashboardShell';
import { Thermometer, CloudRain, Wind, Droplets, Sun, AlertTriangle, AlertCircle, ShieldAlert, RefreshCw, AlertOctagon, LucideIcon } from 'lucide-react';


interface WeatherData { icon: LucideIcon; label: string; value: string; sub: string; }
const WEATHER: WeatherData[] = [
  { icon: Thermometer, label: 'Temperature', value: '28°C', sub: 'Feels like 32°C' },
  { icon: CloudRain, label: 'Rainfall', value: '45mm', sub: 'Heavy (next 6hr)' },
  { icon: Wind, label: 'Wind Speed', value: '38 km/h', sub: 'Gusty NW' },
  { icon: Droplets, label: 'Humidity', value: '89%', sub: 'Very high' },
];

interface StateData { name: string; cls: string; icon: LucideIcon; actions: string; }
const STATES: StateData[] = [
  { name: 'Clear', cls: 'clear', icon: Sun, actions: 'Normal operations\nStandard routing' },
  { name: 'Alert', cls: 'alert', icon: AlertTriangle, actions: 'Monitor active\nPre-stage resources' },
  { name: 'Warning', cls: 'warning', icon: AlertCircle, actions: 'Risky roads flagged\nRoutes reconfigured' },
  { name: 'Emergency', cls: 'emergency', icon: ShieldAlert, actions: 'Full reconfiguration\nAll units deployed' },
  { name: 'Recovery', cls: 'recovery', icon: RefreshCw, actions: 'Gradual restore\nDamage assessment' },
];

const STATE_DESCS = [
  'All systems operating normally. Standard fixed-route dispatch active.',
  'Weather watch triggered. Pre-staging 6 emergency vehicles. Monitoring NOAA feed for escalation.',
  'Risky roads flagged and auto-avoided. 12 routes reconfigured. Emergency crews on standby.',
  'Full emergency protocol. All available units deployed. Non-essential services suspended.',
  'Storm passed. Gradually restoring normal operations. Damage assessment in progress.',
];

const INITIAL_LOG = [
  { time: '14:32:18', text: '[AUTO] NOAA heavy rain alert received — transitioning CLEAR → ALERT' },
  { time: '14:32:19', text: '[AUTO] Pre-staging 6 emergency vehicles from depots' },
  { time: '14:33:01', text: '[AUTO] Risky roads database updated — 4 roads flagged' },
  { time: '14:35:44', text: '[AUTO] Route reconfiguration started — 12 routes affected' },
  { time: '14:36:02', text: '[AUTO] Route reconfiguration complete' },
  { time: '14:38:15', text: '[DISPATCH] Truck T-106 rerouted from Ward 7 via alternate path' },
  { time: '14:40:33', text: '[NLP] Critical complaint: "Drainage overflowing" — Ward 9 auto-escalated' },
  { time: '14:42:10', text: '[NOAA] Wind speed increased to 38 km/h — monitoring for WARNING threshold' },
  { time: '14:45:00', text: '[STATUS] All 12 reconfigured routes operating normally' },
];

const EM_STATS = [
  { label: 'Current State', value: 'ALERT', sub: 'auto-triggered 2h ago' },
  { label: 'Routes Affected', value: '12', sub: 'auto-reconfigured' },
  { label: 'Risky Roads', value: '4', sub: 'flagged & avoided' },
  { label: 'Pre-deployed', value: '6', sub: 'emergency resources' },
];

export default function EmergencyPage() {
  const [currentState, setCurrentState] = useState(1);
  const [log, setLog] = useState(INITIAL_LOG);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const msgs = [
      '[NOAA] Weather data refreshed',
      '[STATUS] Emergency resources: 6 pre-deployed, 4 on standby',
      '[MONITOR] Drainage sensors nominal in 8 of 12 wards',
      '[DISPATCH] Emergency response time: avg 14min',
    ];
    const interval = setInterval(() => {
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      setLog(prev => [...prev, { time, text: msgs[Math.floor(Math.random() * msgs.length)] }]);
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = 9999; }, 50);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const override = (state: number) => {
    setCurrentState(state);
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    setLog(prev => [...prev, { time, text: `[MANUAL] Protocol overridden to ${STATES[state].name.toUpperCase()}` }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = 9999; }, 50);
  };

  return (
    <DashboardShell title="Emergency" badges={[{ type: 'alert', text: 'PROTOCOL: ALERT' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Emergency Control Panel</h1>
        <p className="page-header__sub">NOAA weather-driven autonomous fleet reconfiguration</p>
      </div>

      <div className="stat-grid">
        {EM_STATS.map((s, i) => <div key={i} className="card"><div className="card__label">{s.label}</div><div className="card__value">{s.value}</div><div className="card__sub">{s.sub}</div></div>)}
      </div>

      {/* Weather */}
      <div className="card__title" style={{ marginBottom: '.75rem' }}>Live Weather Data (NOAA Feed)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {WEATHER.map((w, i) => {
          const Icon = w.icon;
          return (
          <div key={i} className="card" style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '.5rem', display: 'flex', justifyContent: 'center' }}><Icon size={32} strokeWidth={1.5} color="var(--primary)" /></div>
            <div className="card__label">{w.label}</div>
            <div className="card__value" style={{ fontSize: '24px' }}>{w.value}</div>
            <div className="card__sub">{w.sub}</div>
          </div>
          );
        })}
      </div>

      <div className="grid-2">
        {/* Protocol State Machine */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Protocol State Machine</div>
          <div className="protocol-bar">
            {STATES.map((s, i) => (
              <div key={i} className={`protocol-state ${s.cls} ${i === currentState ? 'active' : ''}`}>{s.name}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.5rem', marginTop: '1rem' }}>
            {STATES.map((s, i) => {
              const Icon = s.icon;
              return (
              <div key={i} style={{ padding: '.75rem', borderRadius: '8px', background: 'var(--dark-surface)', border: `1px solid ${i === currentState ? 'var(--glow)' : 'var(--border-subtle)'}`, textAlign: 'center', transition: 'all .3s', ...(i === currentState ? { background: 'rgba(232,147,58,.08)' } : {}) }}>
                <div style={{ margin: '.25rem 0', display: 'flex', justifyContent: 'center', color: i === currentState ? 'var(--glow)' : 'var(--primary)' }}><Icon size={24} /></div>
                <div className="mono" style={{ fontSize: '11px', color: i === currentState ? 'var(--glow)' : 'var(--secondary)', marginBottom: '.3rem' }}>{s.name}</div>
                <div style={{ fontSize: '10px', color: '#5a4a3a', lineHeight: 1.4 }}>{s.actions.split('\n').map((a, j) => <span key={j}>{a}<br /></span>)}</div>
              </div>
              );
            })}
          </div>

          <div style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: '.75rem', lineHeight: 1.6 }}>{STATE_DESCS[currentState]}</div>

          <div style={{ background: 'rgba(185,45,45,.06)', border: '1px solid rgba(185,45,45,.2)', borderRadius: '12px', padding: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', color: 'var(--danger)', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}><AlertOctagon size={18} /> Manual Override</div>
            <p style={{ fontSize: '12px', color: 'var(--secondary)' }}>Override auto-triggered protocol state. Use with caution.</p>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button className="btn btn--outline btn--sm" onClick={() => override(0)}>Force CLEAR</button>
              <button className="btn btn--outline btn--sm" onClick={() => override(1)}>Force ALERT</button>
              <button className="btn btn--outline btn--sm" onClick={() => override(2)}>Force WARNING</button>
              <button className="btn btn--danger btn--sm" onClick={() => override(3)}>Force EMERGENCY</button>
              <button className="btn btn--outline btn--sm" onClick={() => override(4)}>Force RECOVERY</button>
            </div>
          </div>
        </div>

        {/* Event Log */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Auto-Trigger Event Log</div>
          <div className="log" ref={logRef} style={{ maxHeight: '500px' }}>
            {log.map((e, i) => (
              <div key={i} className="log-entry"><span>{e.time}</span> {e.text}</div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
