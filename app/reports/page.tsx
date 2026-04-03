'use client';
import { useEffect, useRef } from 'react';
import DashboardShell from '../components/DashboardShell';
import { ClipboardList, BarChart, AlertTriangle, TrendingUp, Bot, Download, Eye } from 'lucide-react';


const KPIS = [
  { label: 'Prediction Accuracy', value: 94.1, color: '#C1440E' },
  { label: 'Zone Coverage', value: 87.3, color: '#7A8C5E' },
  { label: 'Equity Score', value: 91.0, color: '#5a8ca0' },
  { label: 'Fleet Efficiency', value: 84.5, color: '#E8933A' },
];

const REPORTS = [
  { title: 'Daily Operations Report — April 3, 2026', date: 'Today, 18:00', size: '2.4 MB', type: 'daily' },
  { title: 'Daily Operations Report — April 2, 2026', date: 'Yesterday, 18:00', size: '2.1 MB', type: 'daily' },
  { title: 'Weekly Summary — Week 13, 2026', date: 'Mar 30, 18:00', size: '5.8 MB', type: 'weekly' },
  { title: 'Daily Operations Report — April 1, 2026', date: 'Apr 1, 18:00', size: '2.3 MB', type: 'daily' },
  { title: 'Emergency Incident Report — Rainstorm #3', date: 'Mar 28, 22:15', size: '1.7 MB', type: 'emergency' },
  { title: 'Monthly Equity Audit — March 2026', date: 'Mar 31, 00:00', size: '4.2 MB', type: 'monthly' },
];

function getReportIcon(type: string) {
  if (type === 'daily') return <ClipboardList size={24} color="var(--primary)" />;
  if (type === 'weekly') return <BarChart size={24} color="var(--primary)" />;
  if (type === 'emergency') return <AlertTriangle size={24} color="var(--danger)" />;
  return <TrendingUp size={24} color="var(--primary)" />;
}

export default function ReportsPage() {
  const perfRef = useRef<HTMLCanvasElement>(null);
  const covRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Performance Chart
    const perf = perfRef.current;
    if (perf && perf.parentElement) {
      perf.width = perf.parentElement.offsetWidth - 40;
      perf.height = 220;
      const pCtx = perf.getContext('2d')!;
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const accuracy = [91.2, 92.5, 93.1, 94.1, 93.8, 94.5, 94.1];
      const coverage = [82, 84, 85, 87, 86, 88, 87];
      const W = perf.width, H = perf.height, pad = 35;
      pCtx.strokeStyle = '#2e2318'; pCtx.lineWidth = 0.5;
      for (let y = 0; y <= 4; y++) { const yy = pad + (H - pad * 2) * (y / 4); pCtx.beginPath(); pCtx.moveTo(pad, yy); pCtx.lineTo(W - 10, yy); pCtx.stroke(); pCtx.fillStyle = '#5a4a3a'; pCtx.font = '10px "Space Mono"'; pCtx.fillText((100 - y * 5) + '%', 2, yy + 3); }
      days.forEach((d, i) => { const x = pad + (W - pad - 10) * (i / 6); pCtx.fillStyle = '#5a4a3a'; pCtx.font = '10px "Space Mono"'; pCtx.fillText(d, x - 10, H - 5); });
      function drawLine(data: number[], color: string) {
        pCtx.beginPath();
        data.forEach((v, i) => { const x = pad + (W - pad - 10) * (i / 6); const y = pad + (H - pad * 2) * (1 - (v - 80) / 20); i === 0 ? pCtx.moveTo(x, y) : pCtx.lineTo(x, y); });
        pCtx.strokeStyle = color; pCtx.lineWidth = 2.5; pCtx.stroke();
        data.forEach((v, i) => { const x = pad + (W - pad - 10) * (i / 6); const y = pad + (H - pad * 2) * (1 - (v - 80) / 20); pCtx.beginPath(); pCtx.arc(x, y, 3, 0, Math.PI * 2); pCtx.fillStyle = color; pCtx.fill(); });
      }
      drawLine(accuracy, '#C1440E');
      drawLine(coverage, '#7A8C5E');
      pCtx.fillStyle = '#C1440E'; pCtx.fillRect(W - 140, 8, 12, 3);
      pCtx.fillStyle = '#5a4a3a'; pCtx.font = '10px "Space Mono"'; pCtx.fillText('Accuracy', W - 124, 12);
      pCtx.fillStyle = '#7A8C5E'; pCtx.fillRect(W - 140, 20, 12, 3); pCtx.fillText('Coverage', W - 124, 24);
    }

    // Coverage Chart
    const cov = covRef.current;
    if (cov && cov.parentElement) {
      cov.width = cov.parentElement.offsetWidth - 40;
      cov.height = 220;
      const cCtx = cov.getContext('2d')!;
      const zoneCov = [{ name: 'W1', v: 75 }, { name: 'W2', v: 68 }, { name: 'W3', v: 82 }, { name: 'W4', v: 90 }, { name: 'W5', v: 88 }, { name: 'W6', v: 70 }, { name: 'W7', v: 95 }, { name: 'W8', v: 55 }, { name: 'W9', v: 92 }, { name: 'W10', v: 50 }, { name: 'W11', v: 72 }, { name: 'W12', v: 60 }];
      const CW = cov.width, CH = cov.height, CP = 35;
      cCtx.clearRect(0, 0, CW, CH);
      const barW = (CW - CP - 10) / zoneCov.length - 4;
      zoneCov.forEach((z, i) => {
        const x = CP + i * (barW + 4);
        const h = (CH - CP * 2) * (z.v / 100);
        const y = CP + (CH - CP * 2) - h;
        const color = z.v >= 80 ? '#7A8C5E' : z.v >= 60 ? '#D4A96A' : '#C1440E';
        cCtx.fillStyle = color;
        cCtx.beginPath();
        if ((cCtx as any).roundRect) (cCtx as any).roundRect(x, y, barW, h, 3);
        else cCtx.rect(x, y, barW, h);
        cCtx.fill();
        cCtx.fillStyle = '#5a4a3a'; cCtx.font = '9px "Space Mono"'; cCtx.fillText(z.name, x, CH - 5);
        cCtx.fillStyle = color; cCtx.font = 'bold 10px "Space Mono"'; cCtx.fillText(z.v + '%', x, y - 5);
      });
    }
  }, []);

  const circumference = 2 * Math.PI * 36;

  return (
    <DashboardShell title="Reports" badges={[{ type: 'live', text: 'Claude API' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Reports & Analytics</h1>
        <p className="page-header__sub">Auto-generated daily KPI reports via LLM pipeline</p>
      </div>

      {/* KPI Rings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {KPIS.map((k, i) => {
          const offset = circumference * (1 - k.value / 100);
          return (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto .75rem', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 80 80" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                  <circle cx="40" cy="40" r="36" fill="none" stroke="var(--border-subtle)" strokeWidth="4" />
                  <circle cx="40" cy="40" r="36" fill="none" stroke={k.color} strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s' }} />
                </svg>
                <span className="mono" style={{ fontSize: '18px', fontWeight: 700, position: 'relative', zIndex: 1, color: k.color }}>{k.value}%</span>
              </div>
              <div className="card__label">{k.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        <div className="chart-box">
          <div className="card__title">Weekly Performance Trend</div>
          <canvas ref={perfRef} style={{ marginTop: '.5rem' }}></canvas>
        </div>
        <div className="chart-box">
          <div className="card__title">Zone Coverage Distribution</div>
          <canvas ref={covRef} style={{ marginTop: '.5rem' }}></canvas>
        </div>
      </div>

      {/* Report List */}
      <div className="card__title" style={{ marginBottom: '.75rem' }}>Generated Reports</div>
      {REPORTS.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.25rem', marginBottom: '.75rem', transition: 'border-color .2s', cursor: 'default' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '10px', background: r.type === 'emergency' ? 'rgba(185,45,45,.1)' : 'rgba(193,68,14,.1)', flexShrink: 0 }}>{getReportIcon(r.type)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', color: 'var(--text-heading)', fontWeight: 500 }}>{r.title}</div>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '.2rem' }}>{r.date} · {r.size} · PDF</div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', gap: '.5rem' }}>
            <button className="btn btn--outline btn--sm"><Eye size={14} /> View</button>
            <button className="btn btn--primary btn--sm"><Download size={14} /> PDF</button>
          </div>
        </div>
      ))}

      {/* AI Summary */}
      <div style={{ background: 'rgba(122,140,94,.06)', border: '1px solid rgba(122,140,94,.2)', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '18px', color: 'var(--text-heading)', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Bot size={22} color="var(--accent)" /> AI-Generated Daily Summary</div>
        <div style={{ fontSize: '13px', color: 'var(--secondary)', lineHeight: 1.7 }}>
          <p><strong>Daily Operations Summary — April 3, 2026</strong></p>
          <p>Today&apos;s operations achieved <strong>94.1% prediction accuracy</strong> across 39 monitored zones, with fleet coverage reaching <strong>87.3%</strong>. Key highlights:</p>
          <ul style={{ margin: '.5rem 0 .5rem 1.5rem' }}>
            <li style={{ marginBottom: '.3rem' }}><strong>Equity Correction:</strong> Ward 2 was identified as under-served (35% reporting gap). Two water tankers were automatically rerouted, improving Ward 2 coverage from 34% to 78%.</li>
            <li style={{ marginBottom: '.3rem' }}><strong>Demand Surge:</strong> Ward 7 experienced a +38% demand surge at 14:32. PPO dispatcher pre-positioned 3 trucks from Depot 2, reducing response time by 4.2 minutes.</li>
            <li style={{ marginBottom: '.3rem' }}><strong>NLP Flagged:</strong> 5 critical complaints auto-escalated, including a road collapse in Dadar (Ward 5).</li>
            <li style={{ marginBottom: '.3rem' }}><strong>Weather Protocol:</strong> ALERT state triggered at 14:32 due to NOAA heavy rain warning. 12 routes auto-reconfigured.</li>
          </ul>
          <p style={{ color: 'var(--accent)', marginTop: '.75rem' }}>— Generated by Claude API · NagarFlow Report Engine v2.1</p>
        </div>
      </div>
    </DashboardShell>
  );
}
