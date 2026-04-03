'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';

const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const ZONES = [
  { name: 'Ward 1 - Colaba', lat: 18.906, lng: 72.8126, pred: 0.9, real: 0.7, equity: 0.15 },
  { name: 'Ward 2 - Sandhurst', lat: 18.955, lng: 72.832, pred: 0.75, real: 0.4, equity: 0.35 },
  { name: 'Ward 3 - Byculla', lat: 18.978, lng: 72.833, pred: 0.6, real: 0.55, equity: 0.05 },
  { name: 'Ward 4 - Malabar Hill', lat: 18.952, lng: 72.795, pred: 0.3, real: 0.35, equity: -0.05 },
  { name: 'Ward 5 - Dadar', lat: 19.017, lng: 72.844, pred: 0.85, real: 0.82, equity: 0.03 },
  { name: 'Ward 6 - Mahim', lat: 19.037, lng: 72.841, pred: 0.45, real: 0.3, equity: 0.2 },
  { name: 'Ward 7 - Andheri', lat: 19.119, lng: 72.846, pred: 0.95, real: 0.6, equity: 0.35 },
  { name: 'Ward 8 - Borivali', lat: 19.229, lng: 72.856, pred: 0.55, real: 0.5, equity: 0.1 },
  { name: 'Ward 9 - Kurla', lat: 19.07, lng: 72.879, pred: 0.88, real: 0.85, equity: 0.03 },
  { name: 'Ward 10 - Mulund', lat: 19.173, lng: 72.949, pred: 0.4, real: 0.38, equity: 0.02 },
  { name: 'Ward 11 - Ghatkopar', lat: 19.086, lng: 72.908, pred: 0.7, real: 0.5, equity: 0.25 },
  { name: 'Ward 12 - Chembur', lat: 19.062, lng: 72.896, pred: 0.65, real: 0.6, equity: 0.08 },
];

function getColor(v: number) {
  if (v >= 0.8) return '#C1440E';
  if (v >= 0.6) return '#E8933A';
  if (v >= 0.4) return '#D4A96A';
  return '#7A8C5E';
}

const STATS = [
  { label: 'Trucks Active', value: '12', sub: 'of 18 deployed' },
  { label: 'Zones Covered', value: '87%', sub: '34 of 39 zones' },
  { label: 'Prediction Acc.', value: '94.1%', sub: 'last 24hr' },
  { label: 'Equity Score', value: '0.91', sub: 'bias-corrected' },
  { label: 'Avg Response', value: '18m', sub: '−4.2m from baseline' },
];

const ALERTS = [
  { text: 'Ward 7 demand surge +38% — 3 trucks pre-positioned', level: 'critical' },
  { text: 'Equity correction: Ward 2 under-served, 2 tankers rerouted', level: 'high' },
  { text: 'NLP flagged critical complaint: "Road collapsed in Dadar"', level: 'critical' },
];

export default function DashboardPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<'pred' | 'real'>('pred');
  const [equityOn, setEquityOn] = useState(true);
  const [timeVal, setTimeVal] = useState('Now');
  const zonesRef = useRef(ZONES.map(z => ({ ...z })));
  const mapObjRef = useRef<any>(null);
  const circlesRef = useRef<any[]>([]);

  useEffect(() => {
    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;
      const map = L.map(mapRef.current, { zoomControl: false }).setView([19.076, 72.8777], 12);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '©OpenStreetMap ©CARTO', maxZoom: 18 }).addTo(map);
      mapObjRef.current = map;

      const truckIcon = L.divIcon({ className: '', html: '<div style="background:#E8933A;width:10px;height:10px;border-radius:50%;border:2px solid #F2E8D9;box-shadow:0 0 8px rgba(232,147,58,.6)"></div>', iconSize: [10, 10] });
      [[19.02, 72.85], [19.08, 72.89], [19.12, 72.84], [18.96, 72.82], [19.17, 72.95]].forEach((p: any) => {
        L.marker(p, { icon: truckIcon }).addTo(map).bindPopup('🚛 Active Truck');
      });

      drawHeatmap(map, zonesRef.current, layer, equityOn, circlesRef);

      // Live updates
      setInterval(() => {
        const randomZone = zonesRef.current[Math.floor(Math.random() * zonesRef.current.length)];
        randomZone.pred = Math.min(1, Math.max(0.1, randomZone.pred + (Math.random() - 0.5) * 0.1));
        if (mapObjRef.current) drawHeatmap(mapObjRef.current, zonesRef.current, layer, equityOn, circlesRef);
      }, 5000);
    };
    document.head.appendChild(script);
  }, []);

  function drawHeatmap(map: any, zones: typeof ZONES, lyr: 'pred' | 'real', eq: boolean, cRef: React.MutableRefObject<any[]>) {
    const L = (window as any).L;
    if (!L) return;
    cRef.current.forEach(c => map.removeLayer(c));
    cRef.current = [];
    zones.forEach(z => {
      let val = lyr === 'pred' ? z.pred : z.real;
      if (eq && z.equity > 0.1) val = Math.min(1, val + z.equity * 0.5);
      const c = L.circleMarker([z.lat, z.lng], {
        radius: 18 + val * 20,
        fillColor: getColor(val),
        fillOpacity: 0.45,
        color: getColor(val),
        weight: 2, opacity: 0.8
      }).addTo(map);
      c.bindPopup(`<b>${z.name}</b><br>Demand: ${(val * 100).toFixed(0)}%<br>Equity Gap: ${z.equity > 0 ? '+' : ''}${(z.equity * 100).toFixed(0)}%`);
      cRef.current.push(c);
    });
  }

  const handleLayerChange = (newLayer: 'pred' | 'real') => {
    setLayer(newLayer);
    if (mapObjRef.current) drawHeatmap(mapObjRef.current, zonesRef.current, newLayer, equityOn, circlesRef);
  };

  const handleEquityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEquityOn(e.target.checked);
    if (mapObjRef.current) drawHeatmap(mapObjRef.current, zonesRef.current, layer, e.target.checked, circlesRef);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const h = +e.target.value;
    setTimeVal(h === 0 ? 'Now' : `+${h}hr`);
    zonesRef.current.forEach(z => {
      z.pred = Math.min(1, Math.max(0, z.pred + Math.sin(h * 0.3 + z.lat) * 0.15));
    });
    if (mapObjRef.current) drawHeatmap(mapObjRef.current, zonesRef.current, layer, equityOn, circlesRef);
  };

  const sorted = [...ZONES].sort((a, b) => b.pred - a.pred);

  const msgs = ['Zone 7 surge +38% — trucks deployed', 'Equity gap Ward 2 corrected', 'RL dispatcher: fuel saved 15%', '48hr forecast updated', 'Report generated: 94.1% accuracy'];

  return (
    <DashboardShell title="Dashboard" badges={[{ type: 'live', text: 'LIVE' }, { type: 'alert', text: '3 Alerts' }]}>
      <motion.div className="page-header" variants={FADE_UP} initial="hidden" animate="show">
        <h1 className="page-header__title">City Command Center</h1>
        <p className="page-header__sub">Real-time demand prediction, equity correction, and fleet dispatch</p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="show" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {STATS.map((s, i) => (
          <motion.div key={i} className="card" variants={FADE_UP}>
            <div className="card__label">{s.label}</div>
            <div className="card__value">{s.value}</div>
            <div className="card__sub">{s.sub}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Map Controls */}
      <motion.div variants={FADE_UP} initial="hidden" animate="show" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span className="form-label" style={{ margin: 0 }}>Layer:</span>
          <button className={`btn btn--sm ${layer === 'pred' ? 'btn--primary' : 'btn--outline'}`} onClick={() => handleLayerChange('pred')}>Prediction</button>
          <button className={`btn btn--sm ${layer === 'real' ? 'btn--primary' : 'btn--outline'}`} onClick={() => handleLayerChange('real')}>Reality</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span className="form-label" style={{ margin: 0 }}>Equity:</span>
          <label className="toggle">
            <input type="checkbox" checked={equityOn} onChange={handleEquityChange} />
            <div className="toggle__track"></div>
            <div className="toggle__thumb"></div>
          </label>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label><span className="form-label" style={{ margin: 0, display: 'inline' }}>Time: </span>
            <span className="mono" style={{ fontSize: '12px', color: 'var(--glow)', minWidth: '80px', display: 'inline-block' }}>{timeVal}</span>
          </label>
          <input type="range" min="0" max="48" defaultValue="0" onChange={handleTimeChange} />
        </div>
      </motion.div>

      {/* Map + Sidebar */}
      <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="show" className="grid-2-1">
        <motion.div variants={FADE_UP}>
          <div className="map-container map-container--lg" ref={mapRef}></div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '.75rem' }}>
            {[['#C1440E', 'Critical'], ['#E8933A', 'High'], ['#D4A96A', 'Medium'], ['#7A8C5E', 'Low']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontFamily: "'Space Mono',monospace", fontSize: '10px', color: 'var(--secondary)' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color }}></div>{label}
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div variants={STAGGER_CONTAINER}>
          <motion.div variants={FADE_UP} className="card" style={{ marginBottom: '1rem' }}>
            <div className="card__title">Priority Zones</div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {sorted.map((z, i) => {
                const pct = (z.pred * 100).toFixed(0);
                const cls = z.pred >= 0.8 ? '--critical' : z.pred >= 0.6 ? '--high' : z.pred >= 0.4 ? '--medium' : '--low';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.6rem .75rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-heading)', fontWeight: 500 }}>{z.name}</span>
                    <span className={`badge badge${cls}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
          <motion.div variants={FADE_UP} className="card">
            <div className="card__title">Active Alerts</div>
            {ALERTS.map((a, i) => (
              <div key={i} className="feed-item" style={{ marginBottom: '.5rem' }}>
                <div className="feed-item__header"><span className={`badge badge--${a.level}`}>{a.level}</span></div>
                <div className="feed-item__text">{a.text}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Live Ticker */}
      <div style={{ background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '.75rem 1rem', marginTop: '1.5rem', fontFamily: "'Space Mono',monospace", fontSize: '11px', color: 'var(--primary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', animation: 'scroll-ticker 20s linear infinite' }}>
          {msgs.join('  ●  ')}
        </span>
      </div>
      <style>{`@keyframes scroll-ticker{from{transform:translateX(100%)}to{transform:translateX(-100%)}}`}</style>
    </DashboardShell>
  );
}
