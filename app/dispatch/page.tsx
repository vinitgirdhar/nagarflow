'use client';
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, X } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';

const STATS = [
  { label: 'Trucks Active', value: '12', sub: 'of 18 fleet' },
  { label: 'Routes Optimized', value: '8', sub: 'RL-generated' },
  { label: 'Fuel Saved', value: '−15.5%', sub: 'vs fixed routes' },
  { label: 'Avg Response', value: '18m', sub: '−4.2m improvement' },
];

const VEHICLES = [
  { id: 'T-100', type: 'Garbage Truck', status: 'active', zone: 'Ward 5', coverage: 82 },
  { id: 'T-101', type: 'Garbage Truck', status: 'active', zone: 'Ward 1', coverage: 75 },
  { id: 'T-102', type: 'Water Tanker', status: 'active', zone: 'Ward 9', coverage: 90 },
  { id: 'T-103', type: 'Water Tanker', status: 'idle', zone: 'Depot 1', coverage: 0 },
  { id: 'T-104', type: 'Maintenance Van', status: 'active', zone: 'Ward 3', coverage: 65 },
  { id: 'T-105', type: 'Garbage Truck', status: 'idle', zone: 'Depot 2', coverage: 0 },
  { id: 'T-106', type: 'Water Tanker', status: 'active', zone: 'Ward 7', coverage: 88 },
  { id: 'T-107', type: 'Garbage Truck', status: 'maintenance', zone: 'Workshop', coverage: 0 },
  { id: 'T-108', type: 'Garbage Truck', status: 'active', zone: 'Ward 4', coverage: 45 },
];

const INITIAL_SUGGESTIONS = [
  { id: 'RL-001', truck: 'T-105', from: 'Depot 2', to: 'Ward 7 (Andheri)', reason: 'Demand surge +38%. Closest idle truck (2.3km). ETA 8min. Saves 12min vs next option.', confidence: '94%', status: 'pending' },
  { id: 'RL-002', truck: 'T-108', from: 'Ward 4', to: 'Ward 2 (Sandhurst)', reason: 'Equity gap detected: Ward 2 under-served by 35%. Reroute from low-demand Ward 4.', confidence: '87%', status: 'pending' },
  { id: 'RL-003', truck: 'T-112', from: 'Ward 10', to: 'Ward 11 (Ghatkopar)', reason: 'NLP critical: "Water tanker needed urgently in slum area". Coverage gap 40%.', confidence: '91%', status: 'pending' },
];

export default function DispatchPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState(INITIAL_SUGGESTIONS);

  useEffect(() => {
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
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '©OSM ©CARTO', maxZoom: 18 }).addTo(map);
      const routes = [
        { color: '#C1440E', points: [[19.02, 72.85], [19.04, 72.86], [19.07, 72.87], [19.09, 72.88]] },
        { color: '#E8933A', points: [[18.96, 72.82], [18.97, 72.84], [19.00, 72.85], [19.02, 72.86]] },
        { color: '#7A8C5E', points: [[19.12, 72.84], [19.14, 72.85], [19.17, 72.86], [19.19, 72.87]] },
      ];
      routes.forEach((r: any) => L.polyline(r.points, { color: r.color, weight: 3, opacity: 0.7, dashArray: '8 4' }).addTo(map));
      const truckIcon = L.divIcon({ className: '', html: '<div style="background:#E8933A;width:12px;height:12px;border-radius:50%;border:2px solid #F2E8D9;box-shadow:0 0 8px rgba(232,147,58,.6)"></div>', iconSize: [12, 12] });
      [[19.02, 72.85], [19.00, 72.85], [19.14, 72.85], [19.08, 72.91]].forEach((p: any, i) => L.marker(p, { icon: truckIcon }).addTo(map).bindPopup(`🚛 Truck T-${100 + i}`));
      const zoneIcon = L.divIcon({ className: '', html: '<div style="width:24px;height:24px;border-radius:50%;background:rgba(193,68,14,.2);border:2px solid #C1440E;display:flex;align-items:center;justify-content:center;font-size:10px;color:#C1440E;font-weight:bold">!</div>', iconSize: [24, 24] });
      [[19.119, 72.846, 'Ward 7 — Demand 95%'], [19.07, 72.879, 'Ward 9 — Demand 88%']].forEach((z: any) => L.marker([z[0], z[1]], { icon: zoneIcon }).addTo(map).bindPopup(z[2]));
    };
    document.head.appendChild(script);
  }, []);

  const handleAction = (id: string, action: 'accepted' | 'rejected') => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: action } : s));
  };

  return (
    <DashboardShell title="Dispatch" badges={[{ type: 'live', text: '● PPO Active' }, { type: 'alert', text: '3 Pending' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Dispatch & Routing</h1>
        <p className="page-header__sub">PPO RL autonomous dispatcher with operator override</p>
      </div>

      <div className="stat-grid">
        {STATS.map((s, i) => <div key={i} className="card"><div className="card__label">{s.label}</div><div className="card__value">{s.value}</div><div className="card__sub">{s.sub}</div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Map */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Live Fleet Map</div>
          <div className="map-container map-container--lg" ref={mapRef}></div>
        </div>

        {/* RL Suggestions + Vehicle list */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={18} color="var(--primary)" /> RL Dispatcher Suggestions
          </div>
          {suggestions.map(s => (
            <div key={s.id} style={{ background: 'rgba(193,68,14,.06)', border: '1px solid rgba(193,68,14,.2)', borderRadius: '12px', padding: '1.25rem', marginBottom: '.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '15px', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bot size={16} /> {s.id}: {s.truck} → {s.to}
                </div>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--glow)' }}>Confidence: {s.confidence}</div>
              </div>
              <div className="mono" style={{ fontSize: '10px', color: '#5a4a3a', padding: '.5rem', background: '#0a0806', borderRadius: '4px', marginBottom: '.75rem' }}>From: {s.from} | Truck: {s.truck}</div>
              <div style={{ fontSize: '13px', color: 'var(--secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>{s.reason}</div>
              <div style={{ display: 'flex', gap: '.75rem' }}>
                {s.status === 'pending' ? (
                  <>
                    <button className="btn btn--success btn--sm" onClick={() => handleAction(s.id, 'accepted')}><Check size={14} /> Accept</button>
                    <button className="btn btn--danger btn--sm" onClick={() => handleAction(s.id, 'rejected')}><X size={14} /> Reject</button>
                  </>
                ) : (
                  <span className={`badge badge--${s.status === 'accepted' ? 'active' : 'critical'}`}>{s.status}</span>
                )}
              </div>
            </div>
          ))}

          <div className="card__title" style={{ margin: '1.5rem 0 .75rem' }}>Vehicle Fleet</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Zone</th><th>Coverage</th></tr></thead>
              <tbody>
                {VEHICLES.map(v => (
                  <tr key={v.id}>
                    <td><span className="mono" style={{ fontSize: '11px' }}>{v.id}</span></td>
                    <td>{v.type}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.status === 'active' ? 'var(--accent)' : v.status === 'idle' ? 'var(--secondary)' : 'var(--danger)' }}></div>
                        <span className={`badge badge--${v.status === 'active' ? 'active' : v.status === 'idle' ? 'medium' : 'critical'}`}>{v.status}</span>
                      </div>
                    </td>
                    <td>{v.zone}</td>
                    <td style={{ minWidth: '100px' }}>
                      {v.coverage > 0 ? (
                        <>
                          <div style={{ fontSize: '11px', color: 'var(--accent)' }}>{v.coverage}%</div>
                          <div className="coverage-bar"><div className="coverage-fill" style={{ width: `${v.coverage}%`, background: v.coverage >= 80 ? 'var(--accent)' : v.coverage >= 50 ? 'var(--secondary)' : 'var(--primary)' }}></div></div>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
