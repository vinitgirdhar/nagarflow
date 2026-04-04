'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';
import { 
  Users, 
  Activity, 
  Clock, 
  ClipboardList, 
  CheckCircle2, 
  Truck, 
  Droplets, 
  Construction, 
  Trash2, 
  AlertTriangle,
  UserPlus,
  Play,
  CheckCircle,
  MapPin,
  ChevronRight,
  TrendingUp,
  Waves,
  X
} from 'lucide-react';

// Types
type TaskStatus = 'PENDING' | 'ON GROUND' | 'COMPLETED';
type TeamStatus = 'Idle' | 'On Field';

interface Team {
  id: string;
  name: string;
  member_count: number;
  type: string;
  status: TeamStatus;
  current_zone: string | null;
}

interface MaintenanceTask {
  id: string;
  zone: string;
  type: string;
  priority: string;
  status: TaskStatus;
  assigned_team_id: string | null;
  reported_time: string;
  completed_time: string | null;
}

interface Stats {
  total_teams: number;
  active: number;
  idle: number;
  pending: number;
}

// Helpers
const getIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'garbage': return <Trash2 size={16} color="#7A8C5E" />;
    case 'water': return <Waves size={16} color="#5a8ca0" />;
    case 'road': return <Construction size={16} color="#E8933A" />;
    case 'drain': return <Droplets size={16} color="#5a8ca0" />;
    default: return <ClipboardList size={16} color="var(--secondary)" />;
  }
};

const getBadgeColor = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'garbage': return 'rgba(122,140,94,.1)';
    case 'water': return 'rgba(90,140,160,.1)';
    case 'road': return 'rgba(232,147,58,.1)';
    case 'drain': return 'rgba(90,140,160,.1)';
    default: return 'var(--dark-surface)';
  }
};

export default function MaintenancePage() {
  const [stats, setStats] = useState<Stats>({ total_teams: 0, active: 0, idle: 0, pending: 0 });
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningTask, setAssigningTask] = useState<MaintenanceTask | null>(null);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/maintenance/data');
      if (res.ok) {
        const d = await res.json();
        setStats(d.stats);
        setTeams(d.teams);
        setTasks(d.tasks);
      }
    } catch (e) {
      console.error('Maintenance API error');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (teamId: string) => {
    if (!assigningTask) return;
    try {
      const res = await fetch('http://127.0.0.1:5000/api/maintenance/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: assigningTask.id, team_id: teamId })
      });
      if (res.ok) {
        setAssigningTask(null);
        fetchData();
      }
    } catch (e) {
      console.error('Assignment failed');
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/maintenance/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Completion failed');
    }
  };

  return (
    <DashboardShell title="Field Operations" badges={[{ type: 'live', text: 'BMC SUPERVISOR' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Operational Maintenance Center</h1>
        <p className="page-header__sub">Managing municipal squads and ground-level infrastructure projects across Ward districts.</p>
      </div>

      {/* Section 1: Team Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Teams Total', val: stats.total_teams, icon: <Users size={20} />, color: 'var(--primary)' },
          { label: 'Active Now', val: stats.active, icon: <Activity size={20} />, color: 'var(--glow)' },
          { label: 'Idle / Ready', val: stats.idle, icon: <Truck size={20} />, color: 'var(--accent)' },
          { label: 'Tasks Pending', val: stats.pending, icon: <Clock size={20} />, color: 'var(--danger)' },
        ].map((s, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.1 }}
            className="card" 
            style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '2rem' }}
          >
            <div style={{ background: 'var(--dark-surface)', padding: '1rem', borderRadius: '14px', color: s.color }}>{s.icon}</div>
            <div>
              <div className="card__label" style={{ marginBottom: '.5rem', fontSize: '13px' }}>{s.label}</div>
              <div className="mono" style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-heading)', lineHeight: 1 }}>{s.val}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Section 2: Task Board (Kanban) */}
        <div style={{ flex: '0 0 65%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          
          {['PENDING', 'ON GROUND', 'COMPLETED'].map((status) => (
            <div key={status} style={{ minHeight: '600px' }}>
              <div style={{ 
                verticalAlign: 'middle',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                marginBottom: '1.5rem', 
                padding: '0 .75rem',
                borderBottom: `3px solid ${status === 'PENDING' ? 'var(--danger)' : status === 'ON GROUND' ? 'var(--glow)' : 'var(--accent)'}`,
                paddingBottom: '.75rem'
              }}>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '0.08em' }}>{status}</span>
                <span className="badge badge--dark" style={{ opacity: 0.9, fontSize: '12px', padding: '4px 10px' }}>{tasks?.filter(t => t.status === status).length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <AnimatePresence>
                  {tasks?.filter(t => t.status === status).map((task) => (
                    <motion.div 
                      key={task.id}
                      layoutId={task.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="card"
                      style={{ padding: '1.5rem', border: '1px solid var(--border-subtle)', position: 'relative', background: 'var(--dark-surface)', borderRadius: '12px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '8px', borderRadius: '8px', background: getBadgeColor(task.type) }}>{getIcon(task.type)}</div>
                        <span className="mono" style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700 }}>{task.type?.toUpperCase()}</span>
                        {task.priority === 'HIGH' && <span className="badge badge--danger" style={{ marginLeft: 'auto', fontSize: '10px', padding: '4px 8px' }}>HIGH</span>}
                      </div>

                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-heading)', marginBottom: '.5rem' }}>{task.zone}</div>
                      <div className="mono" style={{ fontSize: '12px', color: 'var(--secondary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} /> Reported {new Date(task.reported_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={10} color="var(--secondary)" />
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-body)', fontWeight: 500 }}>
                            {task.assigned_team_id ? `Squad ${task.assigned_team_id}` : 'Unassigned'}
                          </span>
                        </div>

                        {status === 'PENDING' && (
                          <button 
                            className="btn btn--primary" 
                            onClick={() => setAssigningTask(task)}
                            style={{ padding: '10px 20px', fontSize: '12px', height: 'auto', borderRadius: '8px' }}
                          >
                            <UserPlus size={16} /> Assign
                          </button>
                        )}

                        {status === 'ON GROUND' && (
                          <button 
                            className="btn btn--success" 
                            onClick={() => handleComplete(task.id)}
                            style={{ padding: '10px 20px', fontSize: '12px', height: 'auto', borderRadius: '8px' }}
                          >
                            <CheckCircle size={16} /> Done
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>

        {/* Section 3: Team List */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="var(--accent)" />
              <div className="card__title">Field Squads</div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="mono" style={{ textAlign: 'left', padding: '1rem', fontSize: '11px', color: 'var(--secondary)' }}>SQUAD</th>
                    <th className="mono" style={{ textAlign: 'left', padding: '1rem', fontSize: '11px', color: 'var(--secondary)' }}>TYPE</th>
                    <th className="mono" style={{ textAlign: 'left', padding: '1rem', fontSize: '11px', color: 'var(--secondary)' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: team.status === 'On Field' ? 'rgba(122,140,94,.03)' : 'transparent' }}>
                      <td style={{ padding: '1.25rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-heading)' }}>{team.id}</div>
                        <div style={{ fontSize: '12px', color: 'var(--secondary)' }}>{team.member_count} Members</div>
                      </td>
                      <td style={{ padding: '1.25rem' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-body)', background: 'var(--dark-surface)', padding: '6px 10px', borderRadius: '6px', fontWeight: 600 }}>{team.type}</span>
                      </td>
                      <td style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: team.status === 'Idle' ? 'var(--accent)' : 'var(--glow)' }}></div>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: team.status === 'Idle' ? 'var(--accent)' : 'var(--glow)' }}>{team.status}</span>
                        </div>
                        {team.current_zone && <div style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '4px', fontWeight: 500 }}>@{team.current_zone}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* Section 4: Assignment Modal */}
      <AnimatePresence>
        {assigningTask && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.8)', 
            backdropFilter: 'blur(8px)', 
            zIndex: 1000, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '2rem'
          }}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card" 
              style={{ width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '1px solid var(--primary)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <div className="mono" style={{ color: 'var(--primary)', fontSize: '11px', marginBottom: '.5rem' }}>DIRECTIVE CLASSIFICATION</div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-heading)' }}>Assign Field Squad</h2>
                </div>
                <button onClick={() => setAssigningTask(null)} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>

              <div style={{ padding: '1.25rem', background: 'var(--dark-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: getBadgeColor(assigningTask.type), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getIcon(assigningTask.type)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-heading)' }}>{assigningTask.zone}</div>
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--secondary)' }}>TASK: {assigningTask.type?.toUpperCase()}</div>
                  </div>
                </div>
              </div>

              <div className="card__label" style={{ marginBottom: '1rem' }}>Select Available Squad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '.5rem' }}>
                {teams.filter(t => t.status === 'Idle').map(team => (
                  <button 
                    key={team.id}
                    onClick={() => handleAssign(team.id)}
                    className="btn btn--outline"
                    style={{ justifyContent: 'space-between', padding: '1rem', width: '100%', borderColor: team.type === assigningTask.type ? 'var(--accent)' : 'var(--border-subtle)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ padding: '6px', borderRadius: '6px', background: 'var(--dark-surface)' }}>{getIcon(team.type)}</div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Squad {team.id}</div>
                        <div style={{ fontSize: '10px', opacity: 0.6 }}>{team.type} specialists ({team.member_count} men)</div>
                      </div>
                    </div>
                    {team.type === assigningTask.type && <span className="badge badge--accent" style={{ fontSize: '9px' }}>MATCH</span>}
                  </button>
                ))}
                {teams.filter(t => t.status === 'Idle').length === 0 && (
                  <div className="mono" style={{ textAlign: 'center', padding: '2rem', color: 'var(--danger)', fontSize: '12px' }}>
                    NO IDLE SQUADS AVAILABLE.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </DashboardShell>
  );
}
