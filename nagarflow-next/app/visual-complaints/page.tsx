'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';
import {
  Camera, CheckCircle, Clock, AlertTriangle, RefreshCw,
  X, MapPin, Tag, Zap, Eye, Save, XCircle
} from 'lucide-react';

type ImageComplaint = {
  id: string;
  file_id: string;
  image_url: string;
  caption: string;
  chat_id: string;
  zone: string;
  locality: string;
  issue_type: string;
  priority: string;
  status: string;
  timestamp: string;
};

const PRIORITY_OPTIONS = ['pending', 'low', 'medium', 'high', 'critical'];
const STATUS_OPTIONS = ['new', 'under_review', 'in_progress', 'resolved'];
const ISSUE_OPTIONS = ['General', 'Garbage', 'Water', 'Roads', 'Drainage', 'Electricity', 'Other'];

type MetaItem = { className: string; label: string; style?: React.CSSProperties };
type StatusMetaItem = MetaItem & { icon: React.ReactNode };

const PRIORITY_META: Record<string, MetaItem> = {
  critical: { className: 'badge', label: 'CRITICAL', style: { background: '#D32F2F', color: '#fff' } },
  high:     { className: 'badge', label: 'HIGH',     style: { background: '#E67E22', color: '#fff' } },
  medium:   { className: 'badge', label: 'MEDIUM',   style: { background: '#F1C40F', color: '#000' } },
  low:      { className: 'badge', label: 'LOW',      style: { background: '#2ECC71', color: '#fff' } },
  pending:  { className: 'badge', label: 'PENDING',  style: { background: '#95A5A6', color: '#fff' } },
};

const STATUS_META: Record<string, StatusMetaItem> = {
  new:          { className: 'badge',   icon: <AlertTriangle size={11} />, label: 'NEW',          style: { background: '#E0F2F1', color: '#00695C' } },
  under_review: { className: 'badge',   icon: <Eye size={11} />,           label: 'UNDER REVIEW', style: { background: '#FFF3E0', color: '#E65100' } },
  in_progress:  { className: 'badge',   icon: <RefreshCw size={11} />,      label: 'IN PROGRESS',  style: { background: '#E3F2FD', color: '#1565C0' } },
  resolved:     { className: 'badge',   icon: <CheckCircle size={11} />,    label: 'RESOLVED',     style: { background: '#4A7A3E', color: '#fff' } },
};

function formatRelativeTime(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { type: 'spring' as const, stiffness: 220, damping: 22 } },
  exit:   { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

const STAGGER = {
  show: { transition: { staggerChildren: 0.06 } },
};

export default function VisualComplaintsPage() {
  const [complaints, setComplaints] = useState<ImageComplaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [lightbox, setLightbox] = useState<ImageComplaint | null>(null);
  const [editing, setEditing] = useState<{ [id: string]: Partial<ImageComplaint> }>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const load = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/image-complaints');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('failed');
      setComplaints(data.complaints || []);
      setErrorText('');
    } catch {
      setErrorText('Visual complaints feed unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, []);

  const startEdit = (c: ImageComplaint) =>
    setEditing(prev => ({ ...prev, [c.id]: { zone: c.zone, locality: c.locality, issue_type: c.issue_type, priority: c.priority, status: c.status } }));

  const cancelEdit = (id: string) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });

  const saveEdit = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    setSaving(id);
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/image-complaint/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      
      cancelEdit(id);
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } catch (err) {
      console.error('Save error:', err);
      setErrorText('Failed to save changes. Please check if the backend is running.');
      setTimeout(() => setErrorText(''), 3000);
    } finally {
      setSaving(null);
    }
  };

  const filtered = complaints.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterPriority !== 'all' && c.priority !== filterPriority) return false;
    return true;
  });

  const newCount      = complaints.filter(c => c.status === 'new').length;
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length;
  const highCount     = complaints.filter(c => c.priority === 'high' || c.priority === 'critical').length;

  return (
    <DashboardShell
      title="Visual Complaints"
      badges={[
        { type: 'live', text: 'LIVE FEED' },
        ...(newCount > 0 ? [{ type: 'alert' as const, text: `${newCount} Unreviewed` }] : []),
      ]}
    >
      <div className="page-header">
        <h1 className="page-header__title">Visual Complaints</h1>
        <p className="page-header__sub">Photo evidence submitted via Telegram bot — review, assign priority, and update resolution status.</p>
      </div>

      {/* Stats */}
      <motion.div
        className="stat-grid"
        style={{ marginBottom: '1.5rem' }}
        initial="hidden" animate="show" variants={STAGGER}
      >
        {[
          { label: 'Total Received',   value: complaints.length, sub: 'all time',        color: 'var(--text-heading)' },
          { label: 'Unreviewed',       value: newCount,          sub: 'awaiting action', color: newCount > 0 ? '#E8933A' : 'var(--text-heading)' },
          { label: 'High / Critical',  value: highCount,         sub: 'urgent cases',    color: highCount > 0 ? '#C1440E' : 'var(--text-heading)' },
          { label: 'Resolved',         value: resolvedCount,     sub: 'closed',          color: '#7A8C5E' },
        ].map(c => (
          <motion.div key={c.label} className="card" variants={CARD_VARIANTS}>
            <div className="card__label">{c.label}</div>
            <div className="card__value" style={{ color: c.color }}>{c.value}</div>
            <div className="card__sub">{c.sub}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" style={{ maxWidth: '160px' }} suppressHydrationWarning value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input" style={{ maxWidth: '160px' }} suppressHydrationWarning value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All Priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <motion.button
          className="input"
          style={{ cursor: 'pointer', maxWidth: '110px', display: 'flex', alignItems: 'center', gap: '.4rem', justifyContent: 'center' }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={load}
        >
          <RefreshCw size={13} /> Refresh
        </motion.button>
        <span className="mono" style={{ fontSize: '11px', color: 'var(--secondary)', marginLeft: 'auto' }}>
          {filtered.length} complaint{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {errorText && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(193,68,14,0.3)' }}>
          <p className="card__sub">{errorText}</p>
        </motion.div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="mono" style={{ color: 'var(--secondary)', padding: '3rem 0', textAlign: 'center', opacity: 0.6 }}>
          Loading visual complaints...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem', background: '#fff', border: '1px solid #D1C7BC' }}>
          <Camera size={36} style={{ opacity: 0.15, marginBottom: '1.5rem' }} />
          <p className="card__sub" style={{ fontSize: '13px', fontWeight: 500 }}>No complaints match the current filters.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.75rem' }}>
          <AnimatePresence mode="popLayout">
            {filtered.map((c, i) => {
              const patch   = editing[c.id];
              const isEdit  = !!patch;
              const isSaved = saved === c.id;
              const pm      = PRIORITY_META[c.priority] || PRIORITY_META.pending;
              const sm      = STATUS_META[c.status]     || STATUS_META.new;

              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                  className="card"
                  whileHover={{ y: -6, boxShadow: '0 15px 35px rgba(0,0,0,0.12)', borderColor: 'var(--primary)' }}
                  style={{
                    padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    border: isSaved ? '2px solid #4A7A3E' : '1px solid #D1C7BC',
                    background: '#FFFFFF', cursor: 'default',
                  }}
                >
                  {/* Image Part */}
                  <div
                    style={{
                      aspectRatio: '16/9', width: '100%', position: 'relative', overflow: 'hidden',
                      background: '#F9F7F5', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderBottom: '1px solid #EAE2D8',
                    }}
                    onClick={() => setLightbox(c)}
                  >
                    {c.image_url ? (
                      <img
                        src={c.image_url} alt="complaint"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', color: '#7A6B5A', opacity: 0.4 }}>
                        <Camera size={32} strokeWidth={1} />
                        <span className="mono" style={{ fontSize: '10px', fontWeight: 700 }}>NO SOURCE IMAGE</span>
                      </div>
                    )}

                    <motion.div
                      initial={{ opacity: 0 }} whileHover={{ opacity: 1 }}
                      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Eye size={24} style={{ color: '#fff' }} />
                    </motion.div>

                    <div className={pm.className} style={{ position: 'absolute', top: 12, left: 12, fontSize: '10px', fontWeight: 800, border: 'none', ...pm.style }}>
                      {pm.label}
                    </div>

                    <div className={sm.className} style={{ position: 'absolute', top: 12, right: 12, fontSize: '10px', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 800, border: 'none', ...sm.style }}>
                      {sm.icon}{sm.label}
                    </div>
                  </div>

                  {/* Body Part */}
                  <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 800 }}>ID: {c.id}</span>
                      <span className="mono" style={{ fontSize: '10px', color: '#7A6B5A', fontWeight: 600 }}>{formatRelativeTime(c.timestamp)}</span>
                    </div>

                    <div style={{ fontSize: '15px', color: '#1C1410', fontWeight: 700, lineHeight: 1.35 }}>
                      {c.caption && c.caption !== 'No caption' ? c.caption : <span style={{ opacity: 0.4, fontStyle: 'italic', fontWeight: 400 }}>No description available</span>}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                      {c.zone && c.zone !== 'Unknown' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(122,140,94,0.12)', border: '1px solid rgba(122,140,94,0.3)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: '#1C1410', fontWeight: 600, fontFamily: 'Space Mono, monospace' }}>
                          <MapPin size={10} />{c.zone}
                        </span>
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(193,68,14,0.12)', border: '1px solid rgba(193,68,14,0.3)', borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'var(--primary)', fontWeight: 800, fontFamily: 'Space Mono, monospace' }}>
                        <Tag size={10} />{c.issue_type}
                      </span>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '0.4rem' }}>
                      {isEdit ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                          <input className="input" style={{ fontSize: '12px' }} value={patch.zone ?? c.zone} onChange={e => setEditing(prev => ({ ...prev, [c.id]: { ...prev[c.id], zone: e.target.value } }))} placeholder="Sector/Zone" />
                          <div style={{ display: 'flex', gap: '.4rem' }}>
                             <select className="input" style={{ fontSize: '12px', flex: 1 }} value={patch.priority ?? c.priority} onChange={e => setEditing(prev => ({ ...prev, [c.id]: { ...prev[c.id], priority: e.target.value } }))}>
                                {PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                             </select>
                             <select className="input" style={{ fontSize: '12px', flex: 1 }} value={patch.status ?? c.status} onChange={e => setEditing(prev => ({ ...prev, [c.id]: { ...prev[c.id], status: e.target.value } }))}>
                                {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ').toUpperCase()}</option>)}
                             </select>
                          </div>
                          <div style={{ display: 'flex', gap: '.4rem' }}>
                            <button className="btn btn--primary btn--sm" style={{ flex: 2, fontWeight: 700 }} onClick={() => saveEdit(c.id)} disabled={saving === c.id}>{saving === c.id ? 'SYCING...' : 'SAVE CHANGES'}</button>
                            <button className="btn btn--outline btn--sm" style={{ flex: 1 }} onClick={() => cancelEdit(c.id)}>CANCEL</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn btn--outline btn--sm"
                          style={{ width: '100%', justifyContent: 'center', fontWeight: 800, borderRadius: '8px', padding: '10px 0' }}
                          onClick={() => startEdit(c)}
                        >
                          <Zap size={15} fill="currentColor" /> REVIEW &amp; PROCESS
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              style={{ background: 'var(--surface)', borderRadius: 10, padding: '1.5rem', maxWidth: 580, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span className="mono" style={{ fontSize: '12px', color: 'var(--accent)' }}>{lightbox.id}</span>
                  <span className={(PRIORITY_META[lightbox.priority] || PRIORITY_META.pending).className} style={{ fontSize: 9 }}>
                    {(PRIORITY_META[lightbox.priority] || PRIORITY_META.pending).label}
                  </span>
                </div>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setLightbox(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)' }}>
                  <X size={18} />
                </motion.button>
              </div>

              <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: '1rem', background: 'rgba(0,0,0,0.15)', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {lightbox.image_url ? (
                  <img src={lightbox.image_url} alt={lightbox.caption || 'photo'} style={{ width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' }} />
                ) : (
                  <div style={{ textAlign: 'center', opacity: 0.35, padding: '2.5rem' }}>
                    <Camera size={40} />
                    <p className="mono" style={{ fontSize: 10, marginTop: '.5rem' }}>No image</p>
                  </div>
                )}
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-heading)', marginBottom: '1rem', lineHeight: 1.5 }}>
                {lightbox.caption && lightbox.caption !== 'No caption' ? lightbox.caption : <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No caption</span>}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem .85rem' }} className="mono">
                {[
                  { label: 'Zone',     value: lightbox.zone,                   color: 'var(--accent)' },
                  { label: 'Locality', value: lightbox.locality || '—',        color: 'var(--text-heading)' },
                  { label: 'Type',     value: lightbox.issue_type,             color: 'var(--primary)' },
                  { label: 'Status',   value: <span className={(STATUS_META[lightbox.status] || STATUS_META.new).className} style={{ fontSize: 9 }}>{(STATUS_META[lightbox.status] || STATUS_META.new).label}</span> },
                ].map((item, idx) => (
                  <div key={idx} style={{ flex: '1 1 120px' }}>
                    <div style={{ fontSize: 10, color: 'var(--secondary)', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: (item as any).color || 'inherit', fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
                {[
                  { label: 'Received', value: formatRelativeTime(lightbox.timestamp), color: 'var(--text-heading)' },
                  { label: 'Chat ID',  value: lightbox.chat_id || '—',        color: 'var(--secondary)' },
                ].map(row => (
                  <span key={row.label} style={{ fontSize: 11, color: 'var(--secondary)' }}>
                    {row.label}: <b style={{ color: row.color }}>{row.value}</b>
                  </span>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
