'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';
import {
  HardHat, Trash2, Droplets, Construction, ClipboardList,
  Clock, CheckCircle2, Waves, Camera, Loader2, CheckCheck,
  MapPin, X, ChevronRight, CheckSquare, Square,
  AlertTriangle, RefreshCw
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface WorkerTask {
  id: string;
  zone: string;
  type: string;
  priority: string;
  status: string;
  assigned_team_id: string | null;
  reported_time: string;
  completed_time: string | null;
  image_url: string | null;
  worker_notes: string | null;
}

const TASK_STEPS: Record<string, string[]> = {
  garbage: ['Wear safety gloves', 'Collect all garbage bags', 'Load onto vehicle', 'Clear surrounding area', 'Document completion'],
  water:   ['Inspect water source', 'Identify blockage or leak', 'Fix/clear the issue', 'Test water flow', 'Document completion'],
  road:    ['Set up safety barriers', 'Fill potholes / repair surface', 'Compact and level', 'Remove barriers', 'Document completion'],
  drain:   ['Inspect drain entry', 'Clear blockage with tools', 'Flush drain with water', 'Check outflow', 'Document completion'],
};

function getTypeIcon(type: string, size = 20) {
  switch (type?.toLowerCase()) {
    case 'garbage': return <Trash2 size={size} color="#7A8C5E" />;
    case 'water':   return <Waves size={size} color="#5a8ca0" />;
    case 'road':    return <Construction size={size} color="#E8933A" />;
    case 'drain':   return <Droplets size={size} color="#5a8ca0" />;
    default:        return <ClipboardList size={size} color="var(--secondary)" />;
  }
}

function getTypeBg(type: string) {
  switch (type?.toLowerCase()) {
    case 'garbage': return 'rgba(122,140,94,.12)';
    case 'water':   return 'rgba(90,140,160,.12)';
    case 'road':    return 'rgba(232,147,58,.12)';
    case 'drain':   return 'rgba(90,140,160,.12)';
    default:        return 'var(--dark-surface)';
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    'PENDING':              { label: 'Pending',       cls: 'badge badge--medium' },
    'ON GROUND':            { label: 'In Progress',   cls: 'badge badge--high' },
    'COMPLETED_UNVERIFIED': { label: 'Awaiting OK',   cls: 'badge badge--active' },
    'COMPLETED':            { label: 'Completed',     cls: 'badge badge--info' },
  };
  const s = map[status] || { label: status, cls: 'badge' };
  return <span className={s.cls}>{s.label}</span>;
}

export default function WorkerPortalPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [teams, setTeams]           = useState<Team[]>([]);
  const [teamId, setTeamId]         = useState('');
  const [tasks, setTasks]           = useState<WorkerTask[]>([]);
  const [loading, setLoading]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Modal state
  const [activeTask, setActiveTask] = useState<WorkerTask | null>(null);
  const [checks, setChecks]         = useState<boolean[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [notes, setNotes]           = useState('');
  const [uploading, setUploading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError]           = useState('');

  useEffect(() => {
    loadTeams();
    const stored = sessionStorage.getItem('worker_team_id') || '';
    if (stored) setTeamId(stored);
  }, []);

  useEffect(() => {
    if (teamId) {
      sessionStorage.setItem('worker_team_id', teamId);
      loadTasks();
    }
  }, [teamId]);

  const loadTeams = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/worker/teams');
      if (res.ok) setTeams(await res.json());
    } catch { /* offline */ }
  };

  const loadTasks = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/worker/tasks?team_id=${encodeURIComponent(teamId)}`);
      if (res.ok) { setTasks(await res.json()); setLastRefresh(new Date()); }
    } catch { /* offline */ }
    setLoading(false);
  };

  const openTask = (task: WorkerTask) => {
    setActiveTask(task);
    const steps = TASK_STEPS[task.type?.toLowerCase()] || TASK_STEPS.garbage;
    setChecks(new Array(steps.length).fill(false));
    setPreviewUrl(task.image_url || null);
    setUploadedUrl(task.image_url || null);
    setNotes(task.worker_notes || '');
    setSuccessMsg('');
    setError('');
  };

  const closeModal = () => {
    setActiveTask(null);
    setPreviewUrl(null);
    setUploadedUrl(null);
    setNotes('');
    setSuccessMsg('');
    setError('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('http://127.0.0.1:5000/api/worker/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setUploadedUrl(data.url);
      else setError(data.error || 'Upload failed');
    } catch { setError('Upload failed — check connection'); }
    setUploading(false);
  };

  const updateStatus = async (newStatus: 'IN_PROGRESS' | 'COMPLETED_UNVERIFIED') => {
    if (newStatus === 'COMPLETED_UNVERIFIED' && !uploadedUrl) {
      setError('Capture a completion photo first');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('http://127.0.0.1:5000/api/worker/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: activeTask!.id, status: newStatus, image_url: uploadedUrl || '', worker_notes: notes }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(newStatus === 'IN_PROGRESS' ? 'Task marked In Progress!' : 'Submitted for verification!');
        await loadTasks();
        if (newStatus === 'COMPLETED_UNVERIFIED') setTimeout(closeModal, 1800);
      } else setError(data.error || 'Update failed');
    } catch { setError('Network error — try again'); }
    setSubmitting(false);
  };

  const pendingCount  = tasks.filter(t => t.status === 'PENDING').length;
  const activeCount   = tasks.filter(t => t.status === 'ON GROUND').length;
  const doneCount     = tasks.filter(t => t.status === 'COMPLETED_UNVERIFIED').length;

  const steps = activeTask ? (TASK_STEPS[activeTask.type?.toLowerCase()] || TASK_STEPS.garbage) : [];
  const isCompleted  = activeTask?.status === 'COMPLETED_UNVERIFIED';
  const isInProgress = activeTask?.status === 'ON GROUND';
  const isPending    = activeTask?.status === 'PENDING';

  return (
    <DashboardShell title="Worker Portal" badges={[{ type: 'live', text: 'FIELD WORKER' }]}>
      <div className="page-header">
        <h1 className="page-header__title">My Task Board</h1>
        <p className="page-header__sub">View and manage your assigned field tasks for today.</p>
      </div>

      {/* Squad Selector + Stats Row */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {/* Selector */}
        <div className="card" style={{ flex: '0 0 280px', padding: '1.25rem' }}>
          <div className="card__label" style={{ marginBottom: '10px' }}>Your Squad</div>
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              fontSize: '15px', fontWeight: 700, fontFamily: "'Outfit', sans-serif",
              color: 'var(--text-heading)', background: 'var(--bg)',
              border: `2px solid ${teamId ? 'var(--primary)' : 'var(--border-subtle)'}`,
              outline: 'none', cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            }}
          >
            <option value="">— Select Squad —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
          </select>
        </div>

        {/* Stats */}
        {teamId && (
          <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
            {[
              { label: 'Pending',     value: pendingCount, color: 'var(--warning)' },
              { label: 'In Progress', value: activeCount,  color: 'var(--primary)' },
              { label: 'Awaiting OK', value: doneCount,    color: 'var(--accent)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ flex: '1 1 100px', padding: '1.25rem', textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: '30px', fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: "'Space Mono', monospace" }}>{s.value}</div>
                <div className="card__label" style={{ marginTop: '6px', color: 'var(--secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!teamId && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <HardHat size={48} color="var(--border-subtle)" style={{ marginBottom: 16 }} />
          <p className="mono" style={{ fontSize: '12px', color: 'var(--secondary)' }}>Select your squad above to see assigned tasks</p>
        </div>
      )}

      {/* Task List */}
      {teamId && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span className="card__label">Assigned Tasks — {teamId}</span>
            <button
              onClick={loadTasks}
              disabled={loading}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontFamily: "'Space Mono', monospace" }}
            >
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Refresh'}
            </button>
          </div>

          {loading && tasks.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <Loader2 size={28} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
              <CheckCircle2 size={40} color="var(--accent)" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: 6 }}>All Clear!</div>
              <div style={{ fontSize: '13px', color: 'var(--secondary)' }}>No pending tasks for {teamId}</div>
            </div>
          )}

          <motion.div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AnimatePresence>
              {tasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 28 }}
                  className="card"
                  onClick={() => openTask(task)}
                  style={{
                    padding: '1.25rem 1.5rem',
                    cursor: 'pointer',
                    borderLeft: `4px solid ${task.status === 'ON GROUND' ? 'var(--primary)' : task.status === 'COMPLETED_UNVERIFIED' ? 'var(--accent)' : 'var(--border-card)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 46, height: 46, borderRadius: '12px', background: getTypeBg(task.type), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getTypeIcon(task.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-heading)' }}>{task.zone}</span>
                        {task.priority === 'HIGH' && <span className="badge badge--high">HIGH</span>}
                        <StatusBadge status={task.status} />
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--secondary)', textTransform: 'capitalize' }}>{task.type}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Clock size={11} color="var(--secondary)" />
                        <span className="mono" style={{ fontSize: '10px', color: 'var(--secondary)' }}>{task.reported_time?.slice(0, 16) || '—'}</span>
                      </div>
                    </div>
                    <ChevronRight size={18} color="var(--border-card)" />
                  </div>

                  {/* Proof thumbnail if submitted */}
                  {task.image_url && (
                    <div style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)', height: 60, position: 'relative' }}>
                      <img src={task.image_url} alt="Proof" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(74,122,62,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} color="white" />
                        <span className="mono" style={{ fontSize: '10px', color: 'white', fontWeight: 700 }}>PROOF SUBMITTED</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}

      {/* ── Task Detail Slide-Up Modal ── */}
      <AnimatePresence>
        {activeTask && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              style={{ position: 'fixed', inset: 0, background: 'rgba(28,20,16,.45)', backdropFilter: 'blur(4px)', zIndex: 200 }}
            />

            {/* Panel */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: 'var(--surface)',
                borderRadius: '24px 24px 0 0',
                boxShadow: '0 -16px 60px rgba(28,20,16,.16)',
                zIndex: 201,
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '0 0 2rem 0',
              }}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-subtle)' }} />
              </div>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem 1.5rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '14px', background: getTypeBg(activeTask.type), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getTypeIcon(activeTask.type, 24)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '22px', color: 'var(--text-heading)', lineHeight: 1 }}>{activeTask.zone}</div>
                    <div style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: 4, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {activeTask.type}
                      {activeTask.priority === 'HIGH' && <span className="badge badge--high">HIGH</span>}
                      <StatusBadge status={activeTask.status} />
                    </div>
                  </div>
                </div>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)', padding: 4 }}>
                  <X size={22} />
                </button>
              </div>

              <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Task meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Reported', value: activeTask.reported_time?.slice(0, 16) || '—' },
                    { label: 'Squad',    value: activeTask.assigned_team_id || '—' },
                  ].map(m => (
                    <div key={m.label} style={{ background: 'var(--bg)', borderRadius: '10px', padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
                      <div className="card__label" style={{ marginBottom: 4 }}>{m.label}</div>
                      <div className="mono" style={{ fontSize: '12px', color: 'var(--text-heading)' }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Step checklist */}
                <div>
                  <div className="card__label" style={{ marginBottom: '10px' }}>Step Checklist</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {steps.map((step, i) => (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const next = [...checks];
                          next[i] = !next[i];
                          setChecks(next);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px', borderRadius: '10px',
                          border: `1px solid ${checks[i] ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          background: checks[i] ? 'rgba(74,122,62,.07)' : 'var(--bg)',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                          transition: 'all .2s',
                        }}
                      >
                        {checks[i]
                          ? <CheckSquare size={18} color="var(--accent)" />
                          : <Square size={18} color="var(--border-card)" />
                        }
                        <span style={{ fontSize: '14px', fontWeight: checks[i] ? 600 : 400, color: checks[i] ? 'var(--accent)' : 'var(--text-body)', textDecoration: checks[i] ? 'line-through' : 'none', transition: 'all .2s' }}>
                          {step}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Photo Upload (hidden when already completed) */}
                {!isCompleted && (
                  <div>
                    <div className="card__label" style={{ marginBottom: '10px' }}>Proof of Work</div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />

                    {(previewUrl || uploadedUrl) ? (
                      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                        <img src={previewUrl || uploadedUrl || ''} alt="Proof" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />
                        {uploading && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <Loader2 size={20} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
                            <span className="mono" style={{ fontSize: '12px', color: 'var(--primary)' }}>Uploading...</span>
                          </div>
                        )}
                        {uploadedUrl && !uploading && (
                          <div style={{ position: 'absolute', top: 8, right: 8, background: 'var(--accent)', borderRadius: '20px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCheck size={12} color="white" />
                            <span className="mono" style={{ fontSize: '10px', color: 'white', fontWeight: 700 }}>UPLOADED</span>
                          </div>
                        )}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="btn btn--primary"
                          style={{ position: 'absolute', bottom: 8, right: 8, padding: '6px 12px', fontSize: '11px', height: 'auto', borderRadius: '8px', gap: 4 }}
                        >
                          <Camera size={12} /> Retake
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: '100%', padding: '1.75rem', border: '2px dashed var(--border-card)',
                          borderRadius: '14px', background: 'var(--bg)', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                          transition: 'border-color .2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-card)')}
                      >
                        <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(193,68,14,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Camera size={24} color="var(--primary)" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-heading)' }}>Capture Completion Photo</span>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--secondary)' }}>TAP TO OPEN CAMERA / UPLOAD</span>
                      </motion.button>
                    )}

                    {/* Notes */}
                    <textarea
                      placeholder="Add field notes (optional)..."
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      style={{
                        marginTop: '10px', width: '100%', padding: '10px 14px',
                        borderRadius: '10px', fontSize: '14px', fontFamily: "'DM Sans', sans-serif",
                        background: 'var(--bg)', border: '1px solid var(--border-subtle)',
                        color: 'var(--text-heading)', outline: 'none', resize: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Completed proof view */}
                {isCompleted && (activeTask.image_url || uploadedUrl) && (
                  <div>
                    <div className="card__label" style={{ marginBottom: '10px', color: 'var(--accent)' }}>Proof Submitted</div>
                    <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(74,122,62,.3)' }}>
                      <img src={activeTask.image_url || uploadedUrl || ''} alt="Submitted proof" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }} />
                    </div>
                    {activeTask.worker_notes && (
                      <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--secondary)', fontStyle: 'italic', padding: '0 2px' }}>&ldquo;{activeTask.worker_notes}&rdquo;</div>
                    )}
                  </div>
                )}

                {/* Error / Success */}
                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(193,68,14,.08)', border: '1px solid rgba(193,68,14,.2)', color: 'var(--primary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} /> {error}
                  </div>
                )}
                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(74,122,62,.1)', border: '1px solid rgba(74,122,62,.25)', color: 'var(--accent)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <CheckCircle2 size={14} /> {successMsg}
                  </motion.div>
                )}

                {/* Action Buttons */}
                {!isCompleted && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {isPending && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => updateStatus('IN_PROGRESS')}
                        disabled={submitting}
                        className="btn btn--primary"
                        style={{ width: '100%', padding: '16px', fontSize: '15px', height: 'auto', borderRadius: '14px', justifyContent: 'center', opacity: submitting ? 0.7 : 1 }}
                      >
                        {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={18} />}
                        Arrived — Start Task
                      </motion.button>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => updateStatus('COMPLETED_UNVERIFIED')}
                      disabled={submitting || !uploadedUrl}
                      style={{
                        width: '100%', padding: '16px', fontSize: '15px', height: 'auto',
                        borderRadius: '14px', border: 'none', cursor: (submitting || !uploadedUrl) ? 'not-allowed' : 'pointer',
                        background: uploadedUrl ? 'var(--primary)' : 'var(--dark-surface)',
                        color: uploadedUrl ? '#fff' : 'var(--secondary)',
                        fontFamily: "'Outfit', sans-serif", fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                        opacity: submitting ? 0.7 : 1,
                        transition: 'background .3s, color .3s',
                      }}
                    >
                      {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={18} />}
                      {uploadedUrl ? 'Mark as Completed' : 'Add Photo to Complete'}
                    </motion.button>
                  </div>
                )}

                {isCompleted && (
                  <div style={{ textAlign: 'center', padding: '1.25rem', background: 'rgba(74,122,62,.08)', border: '1px solid rgba(74,122,62,.2)', borderRadius: '14px' }}>
                    <CheckCircle2 size={32} color="var(--accent)" style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: 4, color: 'var(--accent)' }}>Submitted for Verification</div>
                    <div style={{ fontSize: '13px', color: 'var(--secondary)' }}>Supervisor will review your proof of work</div>
                  </div>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </DashboardShell>
  );
}
