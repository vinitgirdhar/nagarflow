'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  HardHat, Trash2, Droplets, Construction, ClipboardList,
  ChevronRight, MapPin, Clock, AlertTriangle, CheckCircle2,
  RefreshCw, LogOut, Waves, Zap
} from 'lucide-react';

// Teams will be fetched from API
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

function getTypeIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'garbage': return <Trash2 size={20} color="#7A8C5E" />;
    case 'water': return <Waves size={20} color="#5a8ca0" />;
    case 'road': return <Construction size={20} color="#E8933A" />;
    case 'drain': return <Droplets size={20} color="#5a8ca0" />;
    default: return <ClipboardList size={20} color="var(--secondary)" />;
  }
}

function getStatusChip(status: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    'PENDING':              { label: 'PENDING',      bg: 'rgba(90,74,58,.3)',      color: '#b8a898' },
    'ON GROUND':            { label: 'IN PROGRESS',  bg: 'rgba(232,147,58,.15)',   color: '#E8933A' },
    'COMPLETED_UNVERIFIED': { label: 'AWAITING OK',  bg: 'rgba(52,211,153,.12)',   color: '#34d399' },
  };
  const s = map[status] || { label: status, bg: 'rgba(90,74,58,.3)', color: '#b8a898' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', background: s.bg, color: s.color, fontSize: '10px', fontFamily: "'Space Mono', monospace", fontWeight: 700, letterSpacing: '0.04em' }}>
      {s.label}
    </span>
  );
}

function getPriorityDot(priority: string) {
  const color = priority === 'HIGH' ? '#C1440E' : priority === 'MEDIUM' ? '#E8933A' : '#7A8C5E';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6, flexShrink: 0 }} />;
}

export default function WorkerPortalPage() {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    loadTeams();
    const stored = sessionStorage.getItem('worker_team_id') || '';
    if (stored) {
      setTeamId(stored);
    }
  }, []);

  const loadTeams = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/worker/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch (err) {
      console.error("Failed to load teams", err);
    }
  };

  useEffect(() => {
    if (teamId) {
      sessionStorage.setItem('worker_team_id', teamId);
      loadTasks();
    }
  }, [teamId]);

  const loadTasks = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/worker/tasks?team_id=${encodeURIComponent(teamId)}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
        setLastRefresh(new Date());
      }
    } catch {
      // offline — keep last known
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('nagarflow_role');
    sessionStorage.removeItem('worker_team_id');
    router.push('/login');
  };

  const pendingCount = tasks.filter(t => t.status === 'PENDING').length;
  const activeCount = tasks.filter(t => t.status === 'ON GROUND').length;
  const doneCount = tasks.filter(t => t.status === 'COMPLETED_UNVERIFIED').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-heading)', fontFamily: "'Outfit', sans-serif" }}>

      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'var(--dark-surface)', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(193,68,14,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HardHat size={18} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1 }}>NagarFlow</div>
            <div style={{ fontSize: '10px', color: 'var(--secondary)', fontFamily: "'Space Mono', monospace", marginTop: 2 }}>FIELD WORKER PORTAL</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {lastRefresh && (
            <span style={{ fontSize: '10px', color: 'var(--secondary)', fontFamily: "'Space Mono', monospace" }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={loadTasks} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)', padding: 4 }}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)', padding: 4 }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div style={{ padding: '1.25rem', maxWidth: 560, margin: '0 auto' }}>

        {/* Team Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '11px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>SELECT YOUR SQUAD</label>
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '18px',
              fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: 'var(--text-heading)',
              background: 'var(--dark-surface)', border: `2px solid ${teamId ? 'var(--primary)' : 'var(--border-subtle)'}`,
              outline: 'none', cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center',
            }}
          >
            <option value="">— Choose Squad —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {!teamId && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--secondary)' }}>
            <HardHat size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '12px' }}>Select your squad to view assigned tasks</p>
          </div>
        )}

        {teamId && (
          <>
            {/* Stats Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { label: 'PENDING', value: pendingCount, color: '#b8a898' },
                { label: 'IN PROGRESS', value: activeCount, color: '#E8933A' },
                { label: 'SUBMITTED', value: doneCount, color: '#34d399' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Task Feed */}
            <div style={{ fontSize: '11px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>ASSIGNED TASKS — {teamId}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 6px #34d399' }} />
                LIVE
              </span>
            </div>

            {loading && tasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--secondary)', fontFamily: "'Space Mono', monospace", fontSize: '12px' }}>Loading tasks...</div>
            )}

            {!loading && tasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--dark-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <CheckCircle2 size={36} color="#34d399" style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 700, marginBottom: 6 }}>All Clear!</div>
                <div style={{ fontSize: '13px', color: 'var(--secondary)' }}>No pending tasks for {teamId}</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tasks.map(task => (
                <Link
                  key={task.id}
                  href={`/worker-portal/task/${task.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    background: 'var(--dark-surface)',
                    border: `1px solid ${task.status === 'ON GROUND' ? 'rgba(232,147,58,.4)' : task.status === 'COMPLETED_UNVERIFIED' ? 'rgba(52,211,153,.3)' : 'var(--border-subtle)'}`,
                    borderRadius: '14px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'border-color .2s, transform .1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>

                    {/* Icon */}
                    <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getTypeIcon(task.type)}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {getPriorityDot(task.priority)}
                        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.zone}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: 'var(--secondary)', textTransform: 'capitalize' }}>{task.type}</span>
                        <span style={{ fontSize: '10px', color: 'var(--border-subtle)' }}>•</span>
                        {getStatusChip(task.status)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                        <Clock size={10} color="var(--secondary)" />
                        <span style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)' }}>
                          {task.reported_time ? task.reported_time.slice(0, 16) : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight size={18} color="var(--secondary)" style={{ flexShrink: 0 }} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
