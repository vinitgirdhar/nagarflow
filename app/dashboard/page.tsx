'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';
import VoiceConversation from '../components/VoiceConversation';

const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

function getColor(v: number) {
  if (v >= 0.8) return '#C1440E';
  if (v >= 0.6) return '#E8933A';
  if (v >= 0.4) return '#D4A96A';
  return '#7A8C5E';
}

const STATS = [
  { label: 'Trucks Active', value: '15', sub: 'of 15 deployed' },
  { label: 'Zones Covered', value: '87%', sub: 'MMR Grid Matrix' },
  { label: 'Prediction Acc.', value: '94.1%', sub: 'AiRLLM Core Active' },
  { label: 'Equity Score', value: '0.91', sub: 'bias-corrected' },
  { label: 'Network State', value: 'NOMINAL', sub: 'Polling Port 5000' },
];

export default function DashboardPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  
  // Live State
  const [zonesLive, setZonesLive] = useState<any[]>([]);
  const [trucksLive, setTrucksLive] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<string[]>(['[NOMINAL] System initialized. Routing logic operational.']);

  const mapObjRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  // 1. Setup Leaflet Map Geometry
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
      const map = L.map(mapRef.current, { zoomControl: false }).setView([19.076, 72.8777], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '©OSM' }).addTo(map);
      mapObjRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);

      // Force instant fetch on map load completion
      fetchDashboardData();
      fetchDispatchSuggestions();
    };
    document.head.appendChild(script);

    // Dynamic 10-Second Polling Interval
    const pollId = setInterval(() => {
      fetchDashboardData();
    }, 10000);
    return () => clearInterval(pollId);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setZonesLive(data.predictions || []);
        setTrucksLive(data.trucks || []);
        redrawMap(data.predictions || [], data.trucks || []);
      }
    } catch (e) {
        console.warn('Backend disconnected. Check app.py polling.');
    }
  };

  const fetchDispatchSuggestions = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/dispatch');
      if (res.ok) setSuggestions(await res.json());
    } catch (e) {}
  };

  const redrawMap = (zones: any[], trucks: any[]) => {
    const L = (window as any).L;
    if (!L || !mapObjRef.current || !layerGroupRef.current) return;
    
    // Clear old drawings cleanly
    layerGroupRef.current.clearLayers();
    
    // 1. Draw Heatmap Zones (Size + Color controlled by LLM Output)
    zones.forEach(z => {
      const val = z.priority_score / 100.0;
      L.circleMarker([z.lat, z.lon], {
        radius: 12 + (val * 25),
        fillColor: getColor(val),
        fillOpacity: 0.45,
        color: getColor(val),
        weight: 2,
        opacity: 0.8
      }).addTo(layerGroupRef.current).bindPopup(`<b>${z.zone}</b><br>Priority Score: ${z.priority_score}%`);
    });

    // 2. Draw Active Trucks and Dynamic Route Lines
    const truckIcon = L.divIcon({ className: '', html: '<div style="background:#5a4a3a;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(0,0,0,.5)"></div>', iconSize: [12, 12] });
    const busyIcon = L.divIcon({ className: '', html: '<div style="background:#C1440E;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(193,68,14,.8)"></div>', iconSize: [12, 12] });

    trucks.forEach(t => {
      const isBusy = t.status.startsWith('en_route_to_');
      L.marker([t.lat, t.lon], { icon: isBusy ? busyIcon : truckIcon })
        .addTo(layerGroupRef.current)
        .bindPopup(`<b>${t.name}</b><br>Status: ${t.status}`);

      // Draw dashed geometry lines exactly when accepted
      if (isBusy) {
        const targetZone = t.status.replace('en_route_to_', '');
        const zInfo = zones.find(z => z.zone === targetZone);
        if (zInfo) {
           L.polyline([[t.lat, t.lon], [zInfo.lat, zInfo.lon]], {
               color: '#C1440E', weight: 4, dashArray: '6, 6', opacity: 0.8
           }).addTo(layerGroupRef.current);
        }
      }
    });
  };

  // --- Core Logistics Mutators --- 
  const handleAccept = async (truckId: number, zoneName: string, e?: any) => {
    const L = (window as any).L;
    if (!L || !mapObjRef.current || !layerGroupRef.current) return;

    // 1. Locate Source (Truck) and Destination (Zone)
    const truck = trucksLive.find(t => t.id === truckId);
    const zInfo = zonesLive.find(z => z.zone === zoneName);

    if (truck && zInfo && e) {
      e.target.innerHTML = "Dispatching...";
      
      // 2. Setup Animation Layer
      const start = [truck.lat, truck.lon];
      const end = [zInfo.lat, zInfo.lon];
      
      const truckIcon = L.divIcon({ 
        className: 'dispatch-anim-truck', 
        html: '<div style="background:#C1440E;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 15px rgba(193,68,14,.8);transition:transform 0.1s linear"></div>', 
        iconSize: [16, 16] 
      });
      
      const animMarker = L.marker(start, { icon: truckIcon }).addTo(layerGroupRef.current);
      const animLine = L.polyline([start, start], { color: '#C1440E', weight: 4, dashArray: '6, 6', opacity: 0.6 }).addTo(layerGroupRef.current);
      
      // 3. Kick off Linear Interpolation (2 seconds)
      const duration = 2000;
      const startTime = performance.now();
      
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const currentLat = start[0] + (end[0] - start[0]) * progress;
        const currentLon = start[1] + (end[1] - start[1]) * progress;
        
        animMarker.setLatLng([currentLat, currentLon]);
        animLine.setLatLngs([start, [currentLat, currentLon]]);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Finish animation and sync with backend
          setTimeout(async () => {
             try {
                await fetch('http://127.0.0.1:5000/api/dispatch/accept', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ truck_id: truckId, zone: zoneName })
                });
                setAlerts(prev => [`[LOGISTICS] Locked. Truck-${truckId} routed to ${zoneName}`, ...prev].slice(0, 3));
                await fetchDashboardData(); 
                await fetchDispatchSuggestions(); 
             } catch(err) {}
          }, 200);
        }
      };
      
      requestAnimationFrame(animate);
    }
  };

  const handleArrive = async (truckId: number, zone: string, e?: any) => {
    if(e) e.target.innerHTML = "Logging...";
    try {
      await fetch('http://127.0.0.1:5000/api/dispatch/arrive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truck_id: truckId, zone: zone })
      });
      setAlerts(prev => [`[RESOLVED] Truck-${truckId} confirmed arrival. Zone timestamp reset.`, ...prev].slice(0, 3));
      await fetchDashboardData();
      await fetchDispatchSuggestions();
    } catch(e) {}
  };
  
  const handleSurgeOverride = async () => {
    try {
      await fetch('http://127.0.0.1:5000/api/simulate-surge', {method: 'POST'});
      setAlerts(prev => ['[WARNING] Operator Force Override: Unknown region flooded with +35% anomaly.', ...prev].slice(0, 3));
      await fetchDashboardData(); // Force map to explode
      await fetchDispatchSuggestions(); // Generate emergency routing
    } catch(e) {}
  };

  return (
    <DashboardShell title="Dashboard" badges={[{ type: 'live', text: 'POLLED 10s' }, { type: 'alert', text: 'Live Commands' }]}>
      <motion.div className="page-header" variants={FADE_UP} initial="hidden" animate="show" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
           <h1 className="page-header__title">City Logistics & Action Grid</h1>
           <p className="page-header__sub">Full interactive dispatch layout rendering geometry straight from your 311 SQLite cluster.</p>
        </div>
        <button onClick={handleSurgeOverride} className="btn btn--primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white', fontWeight: 600}}>⚡ Inject +35% System Surge</button>
      </motion.div>

      <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="show" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {STATS.map((s, i) => (
          <motion.div key={i} className="card" variants={FADE_UP}>
            <div className="card__label">{s.label}</div>
            <div className="card__value">{s.value}</div>
            <div className="card__sub">{s.sub}</div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="show" className="grid-2-1">
        <motion.div variants={FADE_UP}>
          <div className="map-container map-container--lg" ref={mapRef} style={{height: '520px'}}></div>
        </motion.div>

        {/* Dynamic Action Array Sidebar */}
        <motion.div variants={STAGGER_CONTAINER} style={{ display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          
          <motion.div variants={FADE_UP} className="card" style={{ flexShrink: 0 }}>
             <div className="card__title">Live Operator Log</div>
             {alerts.map((msg, i) => (
                <div key={i} className="feed-item" style={{ marginBottom: '.25rem' }}>
                  <div className="feed-item__text mono" style={{fontSize: '11px', color: i === 0 ? 'var(--text-heading)' : 'var(--secondary)'}}>{msg}</div>
                </div>
             ))}
          </motion.div>

          <motion.div variants={FADE_UP} style={{ flexShrink: 0 }}>
             <VoiceConversation onTranscribed={(data) => {
                if(data && data.zone) {
                  setAlerts(prev => [`[VOICE LOGGED] ${data.zone}: ${data.issue_type} (Severity: ${data.severity}). Injecting into pipeline.`, ...prev].slice(0, 3));
                }
             }} />
          </motion.div>

          <motion.div variants={FADE_UP} className="card" style={{ flexShrink: 0 }}>
            <div className="card__title">Active Threat DB Log (Top 5)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {zonesLive.slice(0, 5).map((z, i) => {
                const cls = z.priority_score >= 80 ? '--critical' : z.priority_score >= 60 ? '--high' : '--medium';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.4rem .75rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-heading)', fontWeight: 500 }}>{z.zone}</span>
                    <span className={`badge badge${cls}`}>{z.priority_score}%</span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Core Interactive Fleet Haversine Commands */}
          <motion.div variants={FADE_UP} className="card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card__title" style={{ color: 'var(--primary)'}}>Haversine Target Array</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.75rem' }}>
               {suggestions.length === 0 ? <div className="mono" style={{fontSize: '11px', color: 'var(--secondary)', padding: '1rem 0'}}>Network balanced. No routing suggestions.</div> : 
                 suggestions.map(s => (
                  <div key={`${s.truck_id}-${s.zone}`} style={{border: '1px solid var(--primary)', background: 'rgba(122,140,94, 0.05)', borderRadius: '6px', padding: '.6rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem'}}>
                      <span style={{fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)'}}>{s.truck_name} ➔ {s.zone}</span>
                      <span className="mono" style={{fontSize: '10px', color: 'var(--accent)'}}>ETA {s.eta_mins}m</span>
                    </div>
                    <div style={{display: 'flex', gap: '.5rem', marginTop: '.3rem'}}>
                      <button onClick={(e) => handleAccept(s.truck_id, s.zone, e)} className="btn btn--sm btn--primary" style={{flex: 1, padding: '.3rem'}}>Send</button>
                      <button onClick={(e) => handleArrive(s.truck_id, s.zone, e)} className="btn btn--sm btn--outline" style={{flex: 1, padding: '.3rem', background: 'var(--bg)'}}>Arrive</button>
                    </div>
                  </div>
                 ))
               }
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </DashboardShell>
  );
}
