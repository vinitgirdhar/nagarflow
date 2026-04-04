'use client';
import { useState, useEffect } from 'react';
import DashboardShell from '../components/DashboardShell';
import { TrendingUp, Truck, CloudRain, Clock, Building, TriangleAlert } from 'lucide-react';

const WEATHER_LABELS = ['Clear', 'Light Rain', 'Moderate', 'Heavy', 'Extreme'];

function getColor(v: number) {
  if (v >= 80) return '#C1440E';
  if (v >= 60) return '#E8933A';
  if (v >= 40) return '#D4A96A';
  return '#7A8C5E';
}

interface ResultCard { label: string; value: string; delta: string; color?: string; deltaColor?: string; }
interface ZoneData { zone: string; priority_score: number; }

export default function SimulationPage() {
  const [demand, setDemand] = useState(0);
  const [failure, setFailure] = useState(0);
  const [weather, setWeather] = useState(0);
  const [duration, setDuration] = useState(24);
  const [zone, setZone] = useState('all');
  const [running, setRunning] = useState(false);
  
  const [baselineData, setBaselineData] = useState<ZoneData[]>([]);
  const [afterDemand, setAfterDemand] = useState<ZoneData[]>([]);
  
  const [results, setResults] = useState<ResultCard[]>([
    { label: 'Fleet Coverage', value: '87%', delta: 'Baseline', color: 'var(--accent)' },
    { label: 'Avg Response Time', value: '18min', delta: 'Baseline' },
    { label: 'Overloaded Zones', value: '0', delta: 'No overload', color: 'var(--accent)' },
    { label: 'Missed Deployments', value: '2.1%', delta: 'Baseline' },
  ]);
  const [simLog, setSimLog] = useState<string[]>(['[READY] Simulator initialized. Fetching city baseline...']);
  const [overloadAlert, setOverloadAlert] = useState(false);

  // Fetch baseline on load
  useEffect(() => {
    fetchBaseline();
  }, []);

  const fetchBaseline = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/simulation/baseline');
      if (res.ok) {
        const data = await res.json();
        setBaselineData(data);
        setAfterDemand(data);
        setSimLog(['[READY] City Baseline loaded successfully. Adjust parameters and click "Run Simulation".']);
      }
    } catch (e) {
      setSimLog(['[ERROR] Could not connect to Simulation Engine. Check app.py status.']);
    }
  };

  const addLog = (text: string) => setSimLog(prev => [...prev, text]);

  const runSim = async () => {
    setRunning(true);
    setSimLog(['[SIM] Starting City Digital Twin Simulation...']);
    
    // Smooth UI logging simulation
    let logQueue = [
      { text: `[SIM] Parameters: demand +${demand}%, failures ${failure}%, weather=${WEATHER_LABELS[weather]}, duration=${duration}hr`, delay: 500 },
      { text: '[SIM] Querying current city state from SQLite...', delay: 1200 },
      { text: '[SIM] Applying Monte-Carlo demand perturbations...', delay: 2000 },
    ];
    logQueue.forEach(({ text, delay }) => setTimeout(() => addLog(text), delay));

    try {
      const res = await fetch('http://127.0.0.1:5000/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand, failures: failure, weather, duration, zone_filter: zone })
      });

      if (res.ok) {
        const resultData = await res.json();
        
        setTimeout(() => {
          setAfterDemand(resultData.after);
          const stats = resultData.stats;
          
          setResults([
            { 
                label: 'Fleet Coverage', 
                value: stats.coverage + '%', 
                delta: `${(stats.coverage - 87).toFixed(1)}% from baseline`, 
                color: stats.coverage < 60 ? 'var(--danger)' : stats.coverage < 75 ? 'var(--glow)' : 'var(--accent)', 
                deltaColor: stats.coverage < 75 ? 'var(--danger)' : 'var(--accent)' 
            },
            { 
                label: 'Avg Response Time', 
                value: stats.response_time + 'min', 
                delta: `+${stats.response_time - 18}min from baseline`, 
                color: stats.response_time > 25 ? 'var(--danger)' : 'var(--text-heading)', 
                deltaColor: stats.response_time > 22 ? 'var(--danger)' : 'var(--secondary)' 
            },
            { 
                label: 'Overloaded Zones', 
                value: stats.overloaded.toString(), 
                delta: stats.overloaded > 3 ? 'CRITICAL: Fleet stretched' : 'Manageable', 
                color: stats.overloaded > 3 ? 'var(--danger)' : 'var(--glow)', 
                deltaColor: stats.overloaded > 3 ? 'var(--danger)' : 'var(--accent)' 
            },
            { 
                label: 'Missed Deployments', 
                value: stats.missed + '%', 
                delta: `+${(stats.missed - 2.1).toFixed(1)}% from baseline`, 
                color: stats.missed > 10 ? 'var(--danger)' : 'var(--text-heading)', 
                deltaColor: stats.missed > 10 ? 'var(--danger)' : 'var(--secondary)' 
            },
          ]);

          addLog(`[SIM] Discrete event simulation complete.`);
          addLog(`[SIM] Result: ${stats.overloaded} zones at CRITICAL status.`);
          setOverloadAlert(stats.overloaded > 3);
          setRunning(false);
        }, 3000);
      }
    } catch (e) {
      setRunning(false);
      addLog('[ERROR] Simulation API connection failed.');
    }
  };

  const renderGrid = (data: ZoneData[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px', padding: '1rem', height: '100%', overflowY: 'auto' }}>
      {data.map((d, i) => {
        const val = d.priority_score;
        return (
          <div key={i} style={{ borderRadius: '4px', background: getColor(val), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Mono',monospace", fontSize: '9px', color: 'rgba(242,232,217,.7)', transition: 'background .5s', flexDirection: 'column', gap: '2px', padding: '4px', textAlign: 'center' }}>
            <span style={{fontWeight: 700}}>{d.zone}</span><span>{val}%</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <DashboardShell title="Simulation" badges={[{ type: 'info', text: 'SimPy Engine' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Digital Twin Simulator</h1>
        <p className="page-header__sub">What-if scenario sandbox — test before committing real resources</p>
      </div>

      {/* Controls */}
      <div style={{ background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="grid-2" style={{ gap: '2rem' }}>
          <div>
            {[
              { label: <><TrendingUp size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Demand Increase</>, val: demand + '%', min: 0, max: 100, value: demand, onChange: (v: number) => setDemand(v) },
              { label: <><Truck size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Vehicle Failures</>, val: failure + '%', min: 0, max: 50, value: failure, onChange: (v: number) => setFailure(v) },
              { label: <><CloudRain size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Weather Severity</>, val: WEATHER_LABELS[weather], min: 0, max: 4, value: weather, onChange: (v: number) => setWeather(v) },
            ].map((s, i) => (
              <div key={i} style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                  <label className="mono" style={{ fontSize: '12px', color: 'var(--secondary)' }}>{s.label}</label>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--glow)' }}>{s.val}</span>
                </div>
                <input type="range" min={s.min} max={s.max} value={s.value} onChange={e => s.onChange(+e.target.value)} />
              </div>
            ))}
          </div>
          <div>
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                <label className="mono" style={{ fontSize: '12px', color: 'var(--secondary)' }}><Clock size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Simulation Duration</label>
                <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--glow)' }}>{duration}hr</span>
              </div>
              <input type="range" min={4} max={72} value={duration} step={4} onChange={e => setDuration(+e.target.value)} />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                <label className="mono" style={{ fontSize: '12px', color: 'var(--secondary)' }}><Building size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Zones Affected</label>
              </div>
              <select className="input" value={zone} onChange={e => setZone(e.target.value)}>
                <option value="all">All Zones</option>
                <option value="north">North Mumbai</option>
                <option value="central">Central Mumbai</option>
                <option value="south">South Mumbai</option>
                <option value="navi">Navi Mumbai</option>
              </select>
            </div>
            <button className="btn btn--primary btn--lg" onClick={runSim} disabled={running} style={{ width: '100%', marginTop: '.5rem', justifyContent: 'center' }}>
              {running ? '⏳ Simulating Citywide Impact...' : 'Run Simulation'}
            </button>
          </div>
        </div>
      </div>

      {/* Before/After */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {[{ label: 'BEFORE (Real-Time City State)', data: baselineData }, { label: 'AFTER (Simulated Response)', data: afterDemand }].map((g, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: '11px', color: 'var(--accent)', textAlign: 'center', marginBottom: '.5rem' }}>{g.label}</div>
            <div style={{ width: '100%', height: '500px', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>{renderGrid(g.data)}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {results.map((r, i) => (
            <div key={i} style={{ padding: '1rem', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
              <div className="mono" style={{ fontSize: '10px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '.35rem' }}>{r.label}</div>
              <div className="mono" style={{ fontSize: '22px', fontWeight: 700, color: r.color || 'var(--text-heading)' }}>{r.value}</div>
              <div style={{ fontSize: '11px', marginTop: '.2rem', color: r.deltaColor || 'var(--secondary)' }}>{r.delta}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Simulation Log</div>
          <div className="log" style={{ height: '360px', overflowY: 'auto' }}>
            {simLog.map((l, i) => <div key={i} className="log-entry"><span>[SIM]</span> {l}</div>)}
          </div>
        </div>
      </div>

      {overloadAlert && (
        <div style={{ background: 'rgba(185,45,45,.1)', border: '1px solid rgba(185,45,45,.3)', borderRadius: '8px', padding: '1rem', fontFamily: "'Space Mono',monospace", fontSize: '12px', color: 'var(--danger)', marginTop: '1rem', animation: 'pulse-text 1.5s infinite', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TriangleAlert size={18} /> FLEET OVERLOAD DETECTED — Simulated demand exceeds vehicle capacity. PPO recommends mobilizing backup fleet from external wards.
        </div>
      )}
    </DashboardShell>
  );
}
