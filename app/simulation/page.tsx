'use client';
import { useState } from 'react';
import DashboardShell from '../components/DashboardShell';
import { TrendingUp, Truck, CloudRain, Clock, Building, TriangleAlert } from 'lucide-react';

const WEATHER_LABELS = ['Clear', 'Light Rain', 'Moderate', 'Heavy', 'Extreme'];
const ZONE_NAMES = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'];
const BASE_DEMAND = [35,50,40,25,70,38,80,42,75,30,55,48,30,45,35,20,65,33,75,38,70,25,50,43];

function getColor(v: number) {
  if (v >= 80) return '#C1440E';
  if (v >= 60) return '#E8933A';
  if (v >= 40) return '#D4A96A';
  return '#7A8C5E';
}

interface ResultCard { label: string; value: string; delta: string; color?: string; deltaColor?: string; }

export default function SimulationPage() {
  const [demand, setDemand] = useState(0);
  const [failure, setFailure] = useState(0);
  const [weather, setWeather] = useState(0);
  const [duration, setDuration] = useState(24);
  const [zone, setZone] = useState('all');
  const [running, setRunning] = useState(false);
  const [afterDemand, setAfterDemand] = useState(BASE_DEMAND);
  const [results, setResults] = useState<ResultCard[]>([
    { label: 'Fleet Coverage', value: '87%', delta: 'Baseline', color: 'var(--accent)' },
    { label: 'Avg Response Time', value: '18min', delta: 'Baseline' },
    { label: 'Overloaded Zones', value: '0', delta: 'No overload', color: 'var(--accent)' },
    { label: 'Missed Deployments', value: '2.1%', delta: 'Baseline' },
  ]);
  const [simLog, setSimLog] = useState<string[]>(['[READY] Simulator initialized. Adjust parameters and click "Run Simulation".']);
  const [overloadAlert, setOverloadAlert] = useState(false);

  const addLog = (text: string) => setSimLog(prev => [...prev, text]);

  const runSim = () => {
    setRunning(true);
    setSimLog([]);
    let logQueue: Array<{ text: string; delay: number }> = [
      { text: `[SIM] Simulation started: demand +${demand}%, failures ${failure}%, weather=${WEATHER_LABELS[weather]}, duration=${duration}hr, zone=${zone}`, delay: 200 },
      { text: '[SIM] Loading city model...', delay: 600 },
      { text: '[SIM] Injecting demand multiplier...', delay: 1000 },
      { text: `[SIM] Vehicle fleet: ${Math.round(18 * (1 - failure / 100))} of 18 operational`, delay: 1400 },
      { text: '[SIM] Running discrete event simulation (SimPy)...', delay: 1800 },
      { text: '[SIM] Computing route optimizations...', delay: 2400 },
    ];
    logQueue.forEach(({ text, delay }) => setTimeout(() => addLog(text), delay));

    setTimeout(() => {
      const newDemand = BASE_DEMAND.map(d => Math.min(100, Math.max(0, d * (1 + demand / 100) + weather * 5 + (Math.random() - 0.3) * 10)));
      setAfterDemand(newDemand);
      const overloaded = newDemand.filter(d => d >= 80).length;
      const fleet = Math.round(18 * (1 - failure / 100));
      const coverage = Math.max(20, 87 - demand * 0.4 - failure * 0.6 - weather * 3);
      const responseTime = Math.round(18 + demand * 0.15 + failure * 0.3 + weather * 2);
      const missed = Math.min(50, 2.1 + demand * 0.2 + failure * 0.4);

      setResults([
        { label: 'Fleet Coverage', value: coverage.toFixed(1) + '%', delta: `${(coverage - 87).toFixed(1)}% from baseline`, color: coverage < 60 ? 'var(--danger)' : coverage < 75 ? 'var(--glow)' : 'var(--accent)', deltaColor: coverage < 75 ? 'var(--danger)' : 'var(--accent)' },
        { label: 'Avg Response Time', value: responseTime + 'min', delta: `+${responseTime - 18}min from baseline`, color: responseTime > 25 ? 'var(--danger)' : 'var(--text-heading)', deltaColor: responseTime > 22 ? 'var(--danger)' : 'var(--secondary)' },
        { label: 'Overloaded Zones', value: overloaded.toString(), delta: overloaded > 3 ? 'CRITICAL: Fleet stretched' : 'Manageable', color: overloaded > 3 ? 'var(--danger)' : 'var(--glow)', deltaColor: overloaded > 3 ? 'var(--danger)' : 'var(--accent)' },
        { label: 'Missed Deployments', value: missed.toFixed(1) + '%', delta: `+${(missed - 2.1).toFixed(1)}% from baseline`, color: missed > 10 ? 'var(--danger)' : 'var(--text-heading)', deltaColor: missed > 10 ? 'var(--danger)' : 'var(--secondary)' },
      ]);

      addLog(`[SIM] Simulation complete: ${overloaded} zones overloaded, coverage ${coverage.toFixed(1)}%`);
      if (overloaded > 3) addLog('[SIM] ⚠ FLEET OVERLOAD — PPO recommends 2 reserve trucks from depot');
      if (weather >= 3) addLog('[SIM] ⚠ Emergency protocol would auto-trigger at this weather level');
      setOverloadAlert(overloaded > 3);
      setRunning(false);
    }, 3000);
  };

  const renderGrid = (data: number[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '4px', padding: '1rem', height: '100%' }}>
      {data.map((d, i) => {
        const val = Math.min(100, Math.max(0, Math.round(d)));
        return (
          <div key={i} style={{ borderRadius: '4px', background: getColor(val), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Mono',monospace", fontSize: '9px', color: 'rgba(242,232,217,.7)', transition: 'background .5s', flexDirection: 'column', gap: '2px', padding: '4px' }}>
            <span>{ZONE_NAMES[i]}</span><span>{val}%</span>
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
                <option value="north">North (Ward 7,8,10)</option>
                <option value="central">Central (Ward 3,5,6)</option>
                <option value="south">South (Ward 1,2,4)</option>
                <option value="east">East (Ward 9,11,12)</option>
              </select>
            </div>
            <button className="btn btn--primary btn--lg" onClick={runSim} disabled={running} style={{ width: '100%', marginTop: '.5rem', justifyContent: 'center' }}>
              {running ? '⏳ Simulating...' : 'Run Simulation'}
            </button>
          </div>
        </div>
      </div>

      {/* Before/After */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {[{ label: 'BEFORE (Current State)', data: BASE_DEMAND }, { label: 'AFTER (Simulation Result)', data: afterDemand }].map((g, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: '11px', color: 'var(--accent)', textAlign: 'center', marginBottom: '.5rem' }}>{g.label}</div>
            <div style={{ width: '100%', height: '280px', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>{renderGrid(g.data)}</div>
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
          <div className="log">
            {simLog.map((l, i) => <div key={i} className="log-entry"><span>[SIM]</span> {l}</div>)}
          </div>
        </div>
      </div>

      {overloadAlert && (
        <div style={{ background: 'rgba(185,45,45,.1)', border: '1px solid rgba(185,45,45,.3)', borderRadius: '8px', padding: '1rem', fontFamily: "'Space Mono',monospace", fontSize: '12px', color: 'var(--danger)', marginTop: '1rem', animation: 'pulse-text 1.5s infinite', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TriangleAlert size={18} /> FLEET OVERLOAD DETECTED — Demand exceeds available vehicle capacity. PPO recommends deploying 2 reserve trucks from depot.
        </div>
      )}
    </DashboardShell>
  );
}
