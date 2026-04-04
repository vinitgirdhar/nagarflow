'use client';
import { useEffect, useRef, useState } from 'react';
import DashboardShell from '../components/DashboardShell';
import { ClipboardList, BarChart, AlertTriangle, TrendingUp, Bot, Download, Eye, AlertOctagon } from 'lucide-react';
import { motion, Variants } from 'framer-motion';

const FADE_UP: Variants = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

const REPORTS = [
  { title: 'Daily Operations Report', date: 'Today, 18:00', size: '2.4 MB', type: 'daily' },
  { title: 'Weekly Summary — Week 13', date: 'Mar 30, 18:00', size: '5.8 MB', type: 'weekly' },
  { title: 'Emergency Incident Report (Rain)', date: 'Mar 28, 22:15', size: '1.7 MB', type: 'emergency' },
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
  
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // Single robust poll
    const loadData = async () => {
      try {
        const res = await fetch('http://127.0.0.1:5000/api/reports');
        if (res.ok) {
          const d = await res.json();
          setData(d);
          drawGraphs(d);
        }
      } catch (e) { console.error('Reports API failing'); }
    };
    loadData();
    const id = setInterval(loadData, 10000);
    return () => clearInterval(id);
  }, []);

  const drawGraphs = (liveData: any) => {
    const perf = perfRef.current;
    if (perf && perf.parentElement) {
      perf.width = perf.parentElement.offsetWidth - 40;
      perf.height = 220;
      const pCtx = perf.getContext('2d')!;
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const accuracy = liveData.chart_data.accuracy_trend;
      const coverage = liveData.chart_data.coverage_trend;
      
      const W = perf.width, H = perf.height, pad = 35;
      pCtx.strokeStyle = '#2e2318'; pCtx.lineWidth = 0.5;
      for (let y = 0; y <= 4; y++) { const yy = pad + (H - pad * 2) * (y / 4); pCtx.beginPath(); pCtx.moveTo(pad, yy); pCtx.lineTo(W - 10, yy); pCtx.stroke(); pCtx.fillStyle = '#5a4a3a'; pCtx.font = '10px "Space Mono"'; pCtx.fillText((100 - y * 5) + '%', 2, yy + 3); }
      days.forEach((d, i) => { const x = pad + (W - pad - 10) * (i / 6); pCtx.fillStyle = '#5a4a3a'; pCtx.font = '10px "Space Mono"'; pCtx.fillText(d, x - 10, H - 5); });
      
      const drawLine = (dArray: number[], color: string) => {
        pCtx.beginPath();
        dArray.forEach((v, i) => { const x = pad + (W - pad - 10) * (i / 6); const y = pad + (H - pad * 2) * (1 - (v - 80) / 20); i === 0 ? pCtx.moveTo(x, y) : pCtx.lineTo(x, y); });
        pCtx.strokeStyle = color; pCtx.lineWidth = 2.5; pCtx.stroke();
        dArray.forEach((v, i) => { const x = pad + (W - pad - 10) * (i / 6); const y = pad + (H - pad * 2) * (1 - (v - 80) / 20); pCtx.beginPath(); pCtx.arc(x, y, 3, 0, Math.PI * 2); pCtx.fillStyle = color; pCtx.fill(); });
      }
      drawLine(accuracy, '#C1440E');
      drawLine(coverage, '#7A8C5E');
    }

    const cov = covRef.current;
    if (cov && cov.parentElement) {
      cov.width = cov.parentElement.offsetWidth - 40;
      cov.height = 220;
      const cCtx = cov.getContext('2d')!;
      // Simplified mock rendering for layout
      const zoneCov = [{ name: 'W1', v: 75 }, { name: 'W2', v: 68 }, { name: 'W3', v: liveData.kpis.coverage }, { name: 'W4', v: 90 }, { name: 'W5', v: 88 }, { name: 'W6', v: 70 }, { name: 'W7', v: 95 }, { name: 'W8', v: 55 }, { name: 'W9', v: 92 }, { name: 'W10', v: 50 }, { name: 'W11', v: 72 }, { name: 'W12', v: 60 }];
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
      });
    }
  };

  const circumference = 2 * Math.PI * 36;
  const kpis = [
    { label: 'Prediction Accuracy', value: data ? data.kpis.accuracy : 0, color: '#C1440E' },
    { label: 'Zone Coverage', value: data ? data.kpis.coverage : 0, color: '#7A8C5E' },
    { label: 'Equity Score', value: data ? data.kpis.equity : 0, color: '#5a8ca0' },
    { label: 'Fleet Efficiency', value: data ? data.kpis.efficiency : 0, color: '#E8933A' },
  ];

  return (
    <DashboardShell title="Reports" badges={[{ type: 'live', text: 'Validation API' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Validation & Analytics</h1>
        <p className="page-header__sub">Physical feedback loop continuously auditing AiRLLM hallucination thresholds.</p>
      </div>

      {data && data.trigger_retrain && (
         <motion.div variants={FADE_UP} initial="hidden" animate="show" style={{ background: 'rgba(211, 47, 47, 0.1)', border: '2px solid rgba(211, 47, 47, 0.8)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <AlertOctagon size={48} color="rgba(211, 47, 47, 0.9)" />
           <div>
             <h3 style={{ color: 'rgba(211, 47, 47, 0.9)', margin: '0 0 .25rem 0', display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 600 }}>MODEL DRIFT DETECTED: RETRAINING RECOMMENDED</h3>
             <p style={{ color: 'var(--text-heading)', margin: 0, fontSize: '13px' }}>
                The physical feedback loop registered a massive geometric accuracy failure.
                Recent 20 dispatches averaged a <b>{Number(data.recent_error_margin).toFixed(1)}% error margin</b> versus reality (Threshold: 25.0%).
                The localized LLM weights are currently hallucinating localized demand spikes.
             </p>
           </div>
           <button className="btn btn--primary" style={{ marginLeft: 'auto', background: 'rgba(211, 47, 47, 0.9)', border: 'none', color: 'white' }}>Trigger L2 Auto-Retrain</button>
         </motion.div>
      )}

      {/* KPI Rings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {kpis.map((k, i) => {
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
           <div className="card__title" style={{display: 'flex', justifyContent: 'space-between'}}><span>Weekly Validation Drift</span> <span style={{fontSize: '11px', color: '#C1440E'}}>● Target Acc</span></div>
          <canvas ref={perfRef} style={{ marginTop: '.5rem' }}></canvas>
        </div>
        <div className="chart-box">
          <div className="card__title">Zone Disparity Layout</div>
          <canvas ref={covRef} style={{ marginTop: '.5rem' }}></canvas>
        </div>
      </div>

      <div className="card__title" style={{ marginBottom: '.75rem' }}>Automated Core Operations PDFs</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem'}}>
        {REPORTS.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.25rem', transition: 'border-color .2s', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(193,68,14,.1)', flexShrink: 0 }}>{getReportIcon(r.type)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', color: 'var(--text-heading)', fontWeight: 500 }}>{r.title}</div>
              <div className="mono" style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '.4rem' }}>{r.date}</div>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
