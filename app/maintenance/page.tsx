'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';
import { CheckCircle2, ChevronRight, MapPin, AlertCircle, ArrowRight, XCircle, Navigation, Info } from 'lucide-react';

type TaskStatus = 'Suggested' | 'Accepted' | 'On Route' | 'Arrived' | 'Completed';

interface Task {
  id: string;
  zone: string;
  type: string;
  priority: 'High' | 'Medium' | 'Critical';
  reason: string;
  status: TaskStatus;
  lat: number;
  lon: number;
}

const INITIAL_TASKS: Task[] = [
  {
    id: 'T-9921',
    zone: 'Ward 7 - Andheri',
    type: 'Water Pipe Burst',
    priority: 'Critical',
    reason: 'Heavy rainfall detected + Top 5% priority zone ML flag',
    status: 'Suggested',
    lat: 19.119,
    lon: 72.846
  },
  {
    id: 'T-9934',
    zone: 'Ward 2 - Sandhurst',
    type: 'Garbage Overflow',
    priority: 'High',
    reason: 'Low-reporting area (equity boost +35%)',
    status: 'Suggested',
    lat: 18.955,
    lon: 72.832
  }
];

const OPERATOR_START = [19.076, 72.8777]; // Dummy starting point (Sion area)

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function MaintenancePage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [activeTaskId, setActiveTaskId] = useState<string>(INITIAL_TASKS[0].id);
  const [workLog, setWorkLog] = useState('');
  
  const activeTask = tasks.find(t => t.id === activeTaskId);

  // Initialize Map
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
      const map = L.map(mapRef.current, { zoomControl: false }).setView(OPERATOR_START, 11);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '©OSM' }).addTo(map);
      mapObjRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);
      
      renderMap();
    };
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map when active task or status changes
  useEffect(() => {
    if (mapObjRef.current) {
      renderMap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, tasks]);

  const renderMap = () => {
    const L = (window as any).L;
    if (!L || !mapObjRef.current || !layerGroupRef.current) return;
    
    layerGroupRef.current.clearLayers();
    
    // Draw operator loc
    const opIcon = L.divIcon({ className: '', html: '<div style="background:#4a7a3e;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 12px rgba(74,122,62,.8)"></div>', iconSize: [14, 14] });
    L.marker(OPERATOR_START, { icon: opIcon }).addTo(layerGroupRef.current).bindPopup('<b>Unit-7 (You)</b>');

    if (!activeTask) return;

    // Draw Target Zone
    const isCompleted = activeTask.status === 'Completed';
    const targetColor = isCompleted ? '#7A8C5E' : '#C1440E';
    
    L.circleMarker([activeTask.lat, activeTask.lon], {
      radius: 16,
      fillColor: targetColor,
      fillOpacity: 0.4,
      color: targetColor,
      weight: 2
    }).addTo(layerGroupRef.current).bindPopup(`<b>${activeTask.zone}</b><br>${activeTask.type}`);

    // If active and on route or accepted, draw polyline route
    if (activeTask.status === 'On Route' || activeTask.status === 'Accepted' || activeTask.status === 'Arrived') {
      const isArrived = activeTask.status === 'Arrived';
      L.polyline([OPERATOR_START, [activeTask.lat, activeTask.lon]], {
        color: targetColor,
        weight: 4,
        dashArray: isArrived ? undefined : '8, 8',
        opacity: 0.8
      }).addTo(layerGroupRef.current);

      if (isArrived && !isCompleted) {
         // Move operator conceptually to destination
         L.marker([activeTask.lat, activeTask.lon], { icon: opIcon }).addTo(layerGroupRef.current);
      }
    }
    
    // Fit bounds roughly
    const bounds = L.latLngBounds([OPERATOR_START, [activeTask.lat, activeTask.lon]]);
    mapObjRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  const updateStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const handleReject = () => {
    setTasks(prev => prev.filter(t => t.id !== activeTaskId));
    setActiveTaskId(tasks.find(t => t.id !== activeTaskId)?.id || '');
  };

  return (
    <DashboardShell title="Field Execution" badges={[{ type: 'live', text: 'SYNCED' }, { type: 'alert', text: 'Weather Clear' }]}>
      <motion.div className="page-header" variants={FADE_UP} initial="hidden" animate="show">
        <h1 className="page-header__title">Active Dispatch Terminal</h1>
        <p className="page-header__sub">Execute AiRLLM decisions and log real-world coverage updates.</p>
      </motion.div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        
        {/* LEFT PANEL: Task List & Intelligence */}
        <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div className="card" style={{ flexGrow: 1 }}>
            <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} color="var(--primary)" /> Pending Fleet Directives
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '1rem' }}>
              {tasks.length === 0 && <div className="mono" style={{ color: 'var(--secondary)', fontSize: '12px' }}>No active assignments. Standby.</div>}
              
              {tasks.map(t => (
                <motion.div 
                  key={t.id}
                  whileHover={{ scale: 1.01 }}
                  onClick={() => setActiveTaskId(t.id)}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    border: `1px solid ${activeTaskId === t.id ? 'var(--primary)' : 'var(--border-subtle)'}`,
                    background: activeTaskId === t.id ? 'rgba(193,68,14,.05)' : 'var(--dark-surface)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{t.zone}</div>
                    <span className={`badge badge--${t.priority.toLowerCase() === 'critical' ? 'critical' : t.priority.toLowerCase() === 'high' ? 'high' : 'medium'}`}>
                      {t.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-body)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> {t.type}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          
          {/* Active Intelligence Snippet */}
          <AnimatePresence mode="popLayout">
            {activeTask && (
              <motion.div 
                key={activeTask.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card" 
                style={{ background: 'var(--bg)', border: '1px solid var(--border-card)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.75rem' }}>
                  <Info size={16} color="var(--accent)" /> 
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.05em' }}>AI DISPATCH REASONING</span>
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-body)', paddingLeft: '24px', borderLeft: '2px solid rgba(122,140,94,.3)' }}>
                  "{activeTask.reason}"
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* RIGHT PANEL: Map & Action Bottom Bar */}
        <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Map */}
          <div className="card" style={{ padding: '4px', height: '400px', flexShrink: 0 }}>
             <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '8px', background: 'var(--dark-surface)' }}></div>
          </div>

          {/* Action Dashboard */}
          <div className="card" style={{ flexGrow: 1, minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            
            {!activeTask ? (
               <div className="mono" style={{ textAlign: 'center', color: 'var(--secondary)', fontSize: '14px' }}>System Idle</div>
            ) : (
               <>
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>
                      Mission Status: <span style={{ color: activeTask.status === 'Completed' ? 'var(--accent)' : 'var(--primary)' }}>{activeTask.status}</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--secondary)', background: 'var(--dark-surface)', padding: '4px 8px', borderRadius: '4px' }}>
                        ID: {activeTask.id}
                      </span>
                    </div>
                 </div>

                 {/* Dynamic Contextual Action Area */}
                 <div style={{ background: 'var(--dark-surface)', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                   
                   {activeTask.status === 'Suggested' && (
                     <div style={{ display: 'flex', gap: '1rem' }}>
                       <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => updateStatus(activeTask.id, 'Accepted')} className="btn btn--primary" style={{ flex: 1, padding: '16px', fontSize: '14px', justifyContent: 'center' }}>
                         <CheckCircle2 size={18} /> Accept ML Directive
                       </motion.button>
                       <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={handleReject} className="btn btn--outline" style={{ padding: '16px', fontSize: '14px' }}>
                         <XCircle size={18} /> Reject
                       </motion.button>
                     </div>
                   )}

                   {activeTask.status === 'Accepted' && (
                     <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => updateStatus(activeTask.id, 'On Route')} className="btn btn--primary" style={{ width: '100%', padding: '16px', fontSize: '14px', justifyContent: 'center' }}>
                       <Navigation size={18} /> Start Route Navigation
                     </motion.button>
                   )}

                   {activeTask.status === 'On Route' && (
                     <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => updateStatus(activeTask.id, 'Arrived')} className="btn btn--primary" style={{ width: '100%', padding: '16px', fontSize: '14px', justifyContent: 'center', background: '#e8933a' }}>
                       <MapPin size={18} /> Mark Arrived at Destination
                     </motion.button>
                   )}

                   {activeTask.status === 'Arrived' && (
                     <div>
                       <label className="form-label">Completion Operational Log</label>
                       <textarea 
                         value={workLog} 
                         onChange={(e) => setWorkLog(e.target.value)} 
                         className="input" 
                         placeholder="e.g. Cleared drainage blockage. Re-pressurized main valve..." 
                         style={{ minHeight: '80px', resize: 'vertical', marginBottom: '1rem', fontFamily: "'Space Mono', monospace", fontSize: '12px' }} 
                       />
                       <motion.button 
                         whileHover={{ scale: 1.02 }} 
                         whileTap={{ scale: 0.95 }} 
                         onClick={() => { updateStatus(activeTask.id, 'Completed'); setWorkLog(''); }} 
                         disabled={workLog.trim().length < 5}
                         className="btn btn--success" 
                         style={{ width: '100%', padding: '16px', fontSize: '14px', justifyContent: 'center', opacity: workLog.trim().length < 5 ? 0.5 : 1 }}
                       >
                         <CheckCircle2 size={18} /> Upload Log & Close Mission
                       </motion.button>
                     </div>
                   )}

                   {activeTask.status === 'Completed' && (
                      <div style={{ textAlign: 'center', color: 'var(--accent)', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={32} />
                        <div style={{ fontSize: '16px', fontWeight: 600 }}>Coverage Tracked Successfully</div>
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--secondary)' }}>Awaiting next ML assignment...</div>
                      </div>
                   )}

                 </div>
               </>
            )}
          </div>

        </div>

      </div>

    </DashboardShell>
  );
}
