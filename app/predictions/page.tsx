'use client';
import { useEffect, useRef } from 'react';
import DashboardShell from '../components/DashboardShell';

const STATS = [
  { label: 'Forecast Accuracy', value: '94.1%', sub: 'XGBoost + Prophet' },
  { label: 'Surge Window', value: '48hr', sub: 'pre-positioning lead' },
  { label: 'Active Surges', value: '2', sub: 'Ward 7, Ward 9' },
  { label: 'Events Tracked', value: '5', sub: 'calendar-aware' },
];

const ZONES_PRED = [
  { name: 'Ward 1', demand: 42 }, { name: 'Ward 2', demand: 68 },
  { name: 'Ward 5', demand: 85 }, { name: 'Ward 7', demand: 95 },
  { name: 'Ward 9', demand: 88 }, { name: 'Ward 11', demand: 72 },
];

const EVENTS = [
  { icon: '🎉', name: 'Ganesh Chaturthi Procession', detail: 'Ward 5, Ward 9 — starts in 36hr', impact: '+45%', color: '#C1440E' },
  { icon: '🏏', name: 'Cricket Match — Wankhede', detail: 'Ward 1 — starts in 18hr', impact: '+28%', color: '#E8933A' },
  { icon: '🌧️', name: 'Heavy Rain Warning', detail: 'All wards — 12-24hr window', impact: '+35%', color: '#C1440E' },
  { icon: '🏪', name: 'Weekly Market Day', detail: 'Ward 3, Ward 6 — tomorrow', impact: '+15%', color: '#D4A96A' },
  { icon: '🗳️', name: 'Local Election Activity', detail: 'Ward 2, Ward 8 — in 48hr', impact: '+20%', color: '#D4A96A' },
];

const BIAS = [
  { ward: 'Ward 2', expected: 85, actual: 34, corrected: 78 },
  { ward: 'Ward 7', expected: 90, actual: 42, corrected: 85 },
  { ward: 'Ward 11', expected: 72, actual: 28, corrected: 68 },
  { ward: 'Ward 6', expected: 55, actual: 30, corrected: 52 },
];

function getColor(v: number) {
  return v >= 80 ? '#C1440E' : v >= 60 ? '#E8933A' : v >= 40 ? '#D4A96A' : '#7A8C5E';
}

export default function PredictionsPage() {
  const surgeRef = useRef<HTMLCanvasElement>(null);
  const accRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surge = surgeRef.current;
    const acc = accRef.current;
    if (!surge || !acc) return;

    // Surge Chart
    surge.width = surge.parentElement!.offsetWidth - 40;
    surge.height = 220;
    const sCtx = surge.getContext('2d')!;
    const surgeData: number[] = [];
    for (let i = 0; i < 48; i++) {
      const base = 40 + Math.sin(i * 0.15) * 15 + Math.cos(i * 0.08) * 10;
      const spike = (i >= 18 && i <= 24) ? 25 : (i >= 36 && i <= 42) ? 20 : 0;
      surgeData.push(Math.min(100, base + spike + Math.random() * 5));
    }
    const W = surge.width, H = surge.height, pad = 30;
    sCtx.clearRect(0, 0, W, H);
    sCtx.strokeStyle = '#2e2318'; sCtx.lineWidth = 0.5;
    for (let y = 0; y <= 4; y++) {
      const yy = pad + (H - pad * 2) * (y / 4);
      sCtx.beginPath(); sCtx.moveTo(pad, yy); sCtx.lineTo(W - 10, yy); sCtx.stroke();
      sCtx.fillStyle = '#5a4a3a'; sCtx.font = '10px "Space Mono"';
      sCtx.fillText((100 - y * 25) + '%', 2, yy + 3);
    }
    for (let i = 0; i < 48; i += 6) {
      const x = pad + (W - pad - 10) * (i / 47);
      sCtx.fillStyle = '#5a4a3a'; sCtx.font = '10px "Space Mono"';
      sCtx.fillText('+' + i + 'h', x - 10, H - 5);
    }
    sCtx.beginPath();
    sCtx.moveTo(pad, H - pad);
    surgeData.forEach((v, i) => { const x = pad + (W - pad - 10) * (i / 47); const y = pad + (H - pad * 2) * (1 - v / 100); sCtx.lineTo(x, y); });
    sCtx.lineTo(pad + (W - pad - 10), H - pad);
    sCtx.closePath();
    const grad = sCtx.createLinearGradient(0, pad, 0, H - pad);
    grad.addColorStop(0, 'rgba(193,68,14,0.3)'); grad.addColorStop(1, 'rgba(193,68,14,0)');
    sCtx.fillStyle = grad; sCtx.fill();
    sCtx.beginPath();
    surgeData.forEach((v, i) => { const x = pad + (W - pad - 10) * (i / 47); const y = pad + (H - pad * 2) * (1 - v / 100); i === 0 ? sCtx.moveTo(x, y) : sCtx.lineTo(x, y); });
    sCtx.strokeStyle = '#C1440E'; sCtx.lineWidth = 2; sCtx.stroke();
    sCtx.fillStyle = '#E8933A'; sCtx.font = 'bold 10px "Space Mono"';
    [21, 39].forEach(i => {
      const x = pad + (W - pad - 10) * (i / 47);
      const y = pad + (H - pad * 2) * (1 - surgeData[i] / 100);
      sCtx.beginPath(); sCtx.arc(x, y, 4, 0, Math.PI * 2); sCtx.fill();
      sCtx.fillText('SURGE', x - 15, y - 10);
    });

    // Accuracy Chart
    acc.width = acc.parentElement!.offsetWidth - 40;
    acc.height = 220;
    const aCtx = acc.getContext('2d')!;
    const predLine: number[] = [], realLine: number[] = [];
    for (let i = 0; i < 24; i++) {
      const base = 35 + Math.sin(i * 0.3) * 20 + Math.cos(i * 0.15) * 10;
      predLine.push(base);
      realLine.push(base + (Math.random() - 0.5) * 12);
    }
    const AW = acc.width, AH = acc.height, AP = 30;
    aCtx.strokeStyle = '#2e2318'; aCtx.lineWidth = 0.5;
    for (let y = 0; y <= 4; y++) { const yy = AP + (AH - AP * 2) * (y / 4); aCtx.beginPath(); aCtx.moveTo(AP, yy); aCtx.lineTo(AW - 10, yy); aCtx.stroke(); }
    function drawLine(data: number[], color: string) {
      aCtx.beginPath();
      data.forEach((v, i) => { const x = AP + (AW - AP - 10) * (i / 23); const y = AP + (AH - AP * 2) * (1 - v / 80); i === 0 ? aCtx.moveTo(x, y) : aCtx.lineTo(x, y); });
      aCtx.strokeStyle = color; aCtx.lineWidth = 2; aCtx.stroke();
    }
    drawLine(predLine, '#C1440E');
    drawLine(realLine, '#7A8C5E');
    aCtx.fillStyle = '#C1440E'; aCtx.fillRect(AW - 120, 8, 12, 3);
    aCtx.fillStyle = '#5a4a3a'; aCtx.font = '10px "Space Mono"'; aCtx.fillText('Predicted', AW - 104, 12);
    aCtx.fillStyle = '#7A8C5E'; aCtx.fillRect(AW - 120, 20, 12, 3); aCtx.fillText('Actual', AW - 104, 24);
  }, []);

  return (
    <DashboardShell title="Predictions" badges={[{ type: 'live', text: '● Model Active' }, { type: 'alert', text: 'Surge +38%' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Prediction & Surge Forecast</h1>
        <p className="page-header__sub">48-hour demand prediction with calendar-aware surge detection</p>
      </div>

      <div className="stat-grid">
        {STATS.map((s, i) => <div key={i} className="card"><div className="card__label">{s.label}</div><div className="card__value">{s.value}</div><div className="card__sub">{s.sub}</div></div>)}
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        <div className="chart-box">
          <div className="card__title">48-Hour Demand Forecast</div>
          <canvas ref={surgeRef} style={{ marginTop: '.5rem' }}></canvas>
        </div>
        <div className="chart-box">
          <div className="card__title">Prediction vs Reality (Last 24hr)</div>
          <canvas ref={accRef} style={{ marginTop: '.5rem' }}></canvas>
        </div>
      </div>

      {/* 4-Hour Zone Prediction */}
      <div className="card__title" style={{ marginBottom: '.75rem' }}>4-Hour Zone Prediction</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '.5rem', marginBottom: '2rem' }}>
        {ZONES_PRED.map(z => (
          <div key={z.name} style={{ textAlign: 'center', padding: '.75rem .5rem', borderRadius: '8px', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', transition: 'border-color .3s,transform .2s', cursor: 'default' }}>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--accent)' }}>{z.name}</div>
            <div style={{ width: '100%', height: '60px', margin: '.5rem 0', position: 'relative', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${z.demand}%`, background: getColor(z.demand), borderRadius: '4px', transition: 'height .5s' }}></div>
            </div>
            <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: getColor(z.demand) }}>{z.demand}%</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Event Impact */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Event Impact Timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {EVENTS.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '.75rem 1rem', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                <div style={{ fontSize: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: 'rgba(193,68,14,.1)' }}>{e.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-heading)', fontWeight: 500 }}>{e.name}</div>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '.2rem' }}>{e.detail}</div>
                </div>
                <div className="mono" style={{ fontSize: '12px', fontWeight: 700, color: e.color }}>{e.impact}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bias Correction */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Equity Bias Correction</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '.75rem' }}>
            {BIAS.map((b, i) => (
              <div key={i} style={{ padding: '1rem', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--accent)' }}>{b.ward}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '50px', justifyContent: 'center', margin: '.5rem 0' }}>
                  <div style={{ width: '16px', height: `${b.expected * 0.5}px`, borderRadius: '2px 2px 0 0', background: '#5a4a3a' }} title="Expected"></div>
                  <div style={{ width: '16px', height: `${b.actual * 0.5}px`, borderRadius: '2px 2px 0 0', background: 'var(--danger)' }} title="Actual"></div>
                  <div style={{ width: '16px', height: `${b.corrected * 0.5}px`, borderRadius: '2px 2px 0 0', background: 'var(--accent)' }} title="Corrected"></div>
                </div>
                <div className="mono" style={{ fontSize: '12px', color: 'var(--text-heading)' }}>Gap: {((1 - b.actual / b.expected) * 100).toFixed(0)}%</div>
                <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '.2rem' }}>→ Corrected</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
