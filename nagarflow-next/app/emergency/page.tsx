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
  { label: 'Pre-deployed', value: '15', sub: 'emergency resources' },
];

function getColor(v: number) {
  if (v >= 80) return '#C1440E';
  if (v >= 60) return '#E8933A';
  if (v >= 40) return '#D4A96A';
  return '#7A8C5E';
}

export default function EmergencyPage() {
  const [currentState, setCurrentState] = useState(1);
  const [activeLayer, setActiveLayer] = useState<'temperature' | 'aqi'>('temperature');
  const [log, setLog] = useState(INITIAL_LOG);
  const [zonesPred, setZonesPred] = useState<any[]>([]);
  const [weatherZones, setWeatherZones] = useState<any[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  useEffect(() => {
    // Initial fetch for map data
    fetch('http://127.0.0.1:5000/api/predictions')
      .then(res => res.json())
      .then(data => setZonesPred(data))
      .catch(err => console.error("Error fetching emergency predictions:", err));

    fetch('http://127.0.0.1:5000/api/weather/zones')
      .then(res => res.json())
      .then(data => setWeatherZones(data))
      .catch(err => console.error("Error fetching weather zones:", err));

    const msgs = [
      '[NOAA] Weather data refreshed',
      '[STATUS] Emergency resources: 22 pre-deployed, 8 on standby',
      '[MONITOR] Drainage sensors nominal in 8 of 12 wards',
      '[DISPATCH] Emergency response time: avg 12.4min',
    ];
    const interval = setInterval(() => {
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      setLog(prev => [...prev, { time, text: msgs[Math.floor(Math.random() * msgs.length)] }]);
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = 9999; }, 50);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Map Initialization
  useEffect(() => {
    if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      if (mapObjRef.current) {
        mapObjRef.current.remove();
      }

      const map = L.map(mapRef.current, { zoomControl: false }).setView([19.076, 72.8777], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
        attribution: '©OSM',
        opacity: 0.8
      }).addTo(map);
      mapObjRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);
      redrawMap();
    };

    if ((window as any).L) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (mapObjRef.current) {
        mapObjRef.current.remove();
        mapObjRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (zonesPred.length > 0 || weatherZones.length > 0) {
      redrawMap();
    }
  }, [zonesPred, weatherZones, activeLayer]);

  const getTempColor = (t: number) => {
    if (t >= 35) return '#D32F2F'; // Toxic Red
    if (t >= 32) return '#FBC02D'; // Sharp Yellow
    if (t >= 30) return '#4CAF50'; // Leaf Green
    return '#1976D2'; // Marine Blue
  };

  const getAQIColor = (a: number) => {
    if (a >= 300) return '#7E0023'; // Maroon (Hazardous)
    if (a >= 200) return '#8F3F97'; // Purple (Very Unhealthy)
    if (a >= 150) return '#FF0000'; // Red (Unhealthy)
    if (a >= 100) return '#FF7E00'; // Orange (Sensitive)
    if (a >= 50) return '#FFFF00'; // Yellow (Moderate)
    return '#00E400'; // Green (Good)
  };

  const redrawMap = () => {
    const L = (window as any).L;
    if (!L || !layerGroupRef.current) return;
    
    layerGroupRef.current.clearLayers();

    if (activeLayer === 'temperature') {
      weatherZones.forEach(z => {
        L.circleMarker([z.lat, z.lon], {
          radius: 25,
          fillColor: getTempColor(z.temperature),
          fillOpacity: 0.6,
          color: 'transparent',
          weight: 0
        }).addTo(layerGroupRef.current).bindPopup(`<b>${z.name}</b><br>Temperature: ${z.temperature}°C<br>Condition: ${z.condition}`);
      });
    } else if (activeLayer === 'aqi') {
      weatherZones.forEach(z => {
        L.circleMarker([z.lat, z.lon], {
          radius: 25,
          fillColor: getAQIColor(z.aqi),
          fillOpacity: 0.7,
          color: 'white',
          weight: 1
        }).addTo(layerGroupRef.current).bindPopup(`<b>${z.name}</b><br>AQI: ${z.aqi}<br>Risk: ${z.aqi > 150 ? 'UNHEALTHY' : 'MODERATE'}`);
      });
    }
  };

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

      {/* Tactical Implementation Map */}
      <div style={{ width: '100%', height: '400px', borderRadius: '14px', border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: '1.5rem', background: 'var(--dark-surface)', position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }}></div>
        
        {/* Layer Switcher */}
        <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 100, display: 'flex', gap: '.75rem' }}>
          <button 
            onClick={() => setActiveLayer('temperature')} 
            className={`btn btn--sm ${activeLayer === 'temperature' ? 'btn--primary' : 'btn--outline'}`} 
            style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', height: '32px', boxShadow: activeLayer === 'temperature' ? '0 0 15px var(--glow)' : 'none' }}
          >
            🔥 TEMPERATURE
          </button>
          <button 
            onClick={() => setActiveLayer('aqi')} 
            className={`btn btn--sm ${activeLayer === 'aqi' ? 'btn--primary' : 'btn--outline'}`} 
            style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', height: '32px', boxShadow: activeLayer === 'aqi' ? '0 0 15px var(--glow)' : 'none' }}
          >
            🌫️ AQI INDEX
          </button>
        </div>

        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 100, background: 'rgba(10,14,18,0.9)', color: 'white', padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255,165,0,0.3)', backdropFilter: 'blur(10px)', pointerEvents: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }} className="mono">
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--glow)', marginBottom: '2px', opacity: 0.8 }}>SYSTEM OVERLAY</div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em' }}>[ {activeLayer.toUpperCase()} INTELLIGENCE ]</div>
        </div>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: '24px', right: '16px', zIndex: 100, background: 'rgba(10,14,18,0.92)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', minWidth: '150px', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, marginBottom: '10px', color: 'white', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
            {activeLayer === 'temperature' ? '🌡️ HEAT INTENSITY' : '🌫️ AIR QUALITY'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeLayer === 'temperature' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#eee', fontWeight: 500 }}>
                  <div style={{ width: '10px', height: '10px', background: '#D32F2F', borderRadius: '2px', boxShadow: '0 0 5px #D32F2F' }} /> 35°C+ (SCORCHING)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#eee', fontWeight: 500 }}>
                  <div style={{ width: '10px', height: '10px', background: '#FBC02D', borderRadius: '2px', boxShadow: '0 0 5px #FBC02D' }} /> 32°C+ (WARM)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#eee', fontWeight: 500 }}>
                  <div style={{ width: '10px', height: '10px', background: '#1976D2', borderRadius: '2px', boxShadow: '0 0 5px #1976D2' }} /> OPTIMAL
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#eee', fontWeight: 500 }}>
                  <div style={{ width: '10px', height: '10px', background: '#8F3F97', borderRadius: '2px', boxShadow: '0 0 5px #8F3F97' }} /> 200+ (HAZARDOUS)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#eee', fontWeight: 500 }}>
                  <div style={{ width: '10px', height: '10px', background: '#FF0000', borderRadius: '2px', boxShadow: '0 0 5px #FF0000' }} /> 150+ (UNHEALTHY)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#eee', fontWeight: 500 }}>
                  <div style={{ width: '10px', height: '10px', background: '#00E400', borderRadius: '2px', boxShadow: '0 0 5px #00E400' }} /> GOOD
                </div>
              </>
            )}
          </div>
        </div>
        <style jsx global>{`
          @keyframes pulse-red {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.1); opacity: 0.4; }
            100% { transform: scale(0.95); opacity: 0.8; }
          }
          .pulsing-emergency {
            animation: pulse-red 2s infinite ease-in-out;
          }
        `}</style>
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
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '16px', color: 'var(--danger)', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 700 }}><AlertOctagon size={18} /> Manual Override</div>
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
          <div className="log" ref={logRef}>
            {log.map((e, i) => (
              <div key={i} className="log-entry"><span>{e.time}</span> {e.text}</div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
