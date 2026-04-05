'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Trash2, Droplets, Construction, ClipboardList,
  Camera, CheckCircle2, Loader2, MapPin, Clock, AlertTriangle,
  Waves, ImageIcon, Upload, CheckCheck
} from 'lucide-react';

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

function getTypeIcon(type: string, size = 24) {
  switch (type?.toLowerCase()) {
    case 'garbage': return <Trash2 size={size} color="#7A8C5E" />;
    case 'water': return <Waves size={size} color="#5a8ca0" />;
    case 'road': return <Construction size={size} color="#E8933A" />;
    case 'drain': return <Droplets size={size} color="#5a8ca0" />;
    default: return <ClipboardList size={size} color="var(--secondary)" />;
  }
}

const STATUS_STEPS = ['PENDING', 'ON GROUND', 'COMPLETED_UNVERIFIED'];

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params?.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [task, setTask] = useState<WorkerTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const loadTask = async () => {
    setLoading(true);
    try {
      const teamId = sessionStorage.getItem('worker_team_id') || '';
      const res = await fetch(`http://127.0.0.1:5000/api/worker/tasks?team_id=${encodeURIComponent(teamId)}`);
      if (res.ok) {
        const all: WorkerTask[] = await res.json();
        const found = all.find(t => t.id === taskId);
        if (found) {
          setTask(found);
          if (found.image_url) setUploadedUrl(found.image_url);
          if (found.worker_notes) setNotes(found.worker_notes);
        }
      }
    } catch { /* offline */ }
    setLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('http://127.0.0.1:5000/api/worker/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadedUrl(data.url);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch {
      setError('Upload failed — check connection');
    }
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
        body: JSON.stringify({
          task_id: taskId,
          status: newStatus,
          image_url: uploadedUrl || '',
          worker_notes: notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(newStatus === 'IN_PROGRESS' ? 'Status updated — In Progress' : 'Task submitted for verification!');
        await loadTask();
        if (newStatus === 'COMPLETED_UNVERIFIED') {
          setTimeout(() => router.push('/worker-portal'), 1800);
        }
      } else {
        setError(data.error || 'Update failed');
      }
    } catch {
      setError('Network error — try again');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <Loader2 size={32} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg)', color: 'var(--secondary)' }}>
        <AlertTriangle size={40} />
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '13px' }}>Task not found</p>
        <button onClick={() => router.push('/worker-portal')} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-heading)', cursor: 'pointer' }}>← Back</button>
      </div>
    );
  }

  const isCompleted = task.status === 'COMPLETED_UNVERIFIED';
  const isInProgress = task.status === 'ON GROUND';
  const isPending = task.status === 'PENDING';

  const priorityColor = task.priority === 'HIGH' ? '#C1440E' : task.priority === 'MEDIUM' ? '#E8933A' : '#7A8C5E';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-heading)', fontFamily: "'Outfit', sans-serif", paddingBottom: '2rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem 1.25rem', background: 'var(--dark-surface)', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/worker-portal')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-heading)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={22} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: '16px', lineHeight: 1 }}>Task {task.id}</div>
          <div style={{ fontSize: '11px', color: 'var(--secondary)', fontFamily: "'Space Mono', monospace", marginTop: 2 }}>FIELD DETAIL VIEW</div>
        </div>
      </div>

      <div style={{ padding: '1.25rem', maxWidth: 560, margin: '0 auto' }}>

        {/* Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '1.5rem', background: 'var(--dark-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          {(['PENDING', 'IN PROGRESS', 'SUBMITTED'] as const).map((label, i) => {
            const steps = ['PENDING', 'ON GROUND', 'COMPLETED_UNVERIFIED'];
            const currentIdx = steps.indexOf(task.status);
            const isDone = i <= currentIdx;
            return (
              <div key={label} style={{ flex: 1, padding: '10px 4px', textAlign: 'center', background: isDone ? (i === 2 ? 'rgba(52,211,153,.12)' : 'rgba(193,68,14,.1)') : 'transparent', borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", fontWeight: 700, color: isDone ? (i === 2 ? '#34d399' : 'var(--primary)') : 'var(--secondary)', letterSpacing: '0.04em' }}>{label}</div>
              </div>
            );
          })}
        </div>

        {/* Task Card */}
        <div style={{ background: 'var(--dark-surface)', border: `1px solid ${priorityColor}44`, borderRadius: '16px', padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: '12px', background: 'rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {getTypeIcon(task.type, 26)}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '20px', lineHeight: 1 }}>{task.zone}</div>
              <div style={{ fontSize: '13px', color: 'var(--secondary)', marginTop: 3, textTransform: 'capitalize' }}>{task.type} · <span style={{ color: priorityColor, fontWeight: 600 }}>{task.priority}</span></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)', marginBottom: 4 }}>REPORTED</div>
              <div style={{ fontSize: '12px', fontFamily: "'Space Mono', monospace" }}>{task.reported_time?.slice(0, 16) || '—'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)', marginBottom: 4 }}>SQUAD</div>
              <div style={{ fontSize: '12px', fontFamily: "'Space Mono', monospace" }}>{task.assigned_team_id || '—'}</div>
            </div>
          </div>
        </div>

        {/* Proof of Work */}
        {!isCompleted && (
          <div style={{ background: 'var(--dark-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '11px', fontFamily: "'Space Mono', monospace", color: 'var(--secondary)', marginBottom: '12px', letterSpacing: '0.06em' }}>PROOF OF WORK</div>

            {/* Photo Capture */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {(previewUrl || uploadedUrl) ? (
              <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px', border: '1px solid var(--border-subtle)' }}>
                <img src={previewUrl || uploadedUrl || ''} alt="Proof" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }} />
                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Loader2 size={20} color="white" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ color: 'white', fontSize: '13px', fontFamily: "'Space Mono', monospace" }}>Uploading...</span>
                  </div>
                )}
                {uploadedUrl && !uploading && (
                  <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(52,211,153,.9)', borderRadius: '20px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCheck size={12} color="white" />
                    <span style={{ fontSize: '10px', color: 'white', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>UPLOADED</span>
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'white', fontSize: '11px', fontFamily: "'Space Mono', monospace" }}
                >
                  <Camera size={13} /> Retake
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', padding: '2rem', border: '2px dashed var(--border-subtle)', borderRadius: '12px',
                  background: 'rgba(255,255,255,.02)', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: '10px', marginBottom: '12px', transition: 'border-color .2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <Camera size={32} color="var(--secondary)" />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>Capture Completion Photo</span>
                <span style={{ fontSize: '11px', color: 'var(--secondary)', fontFamily: "'Space Mono', monospace" }}>TAP TO OPEN CAMERA</span>
              </button>
            )}

            {/* Notes */}
            <textarea
              placeholder="Add field notes (optional)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
                fontFamily: "'Outfit', sans-serif", background: 'rgba(255,255,255,.04)',
                border: '1px solid var(--border-subtle)', color: 'var(--text-heading)',
                outline: 'none', resize: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Existing proof (completed) */}
        {isCompleted && (uploadedUrl || task.image_url) && (
          <div style={{ background: 'var(--dark-surface)', border: '1px solid rgba(52,211,153,.3)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '11px', fontFamily: "'Space Mono', monospace", color: '#34d399', marginBottom: '12px', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="#34d399" /> PROOF SUBMITTED
            </div>
            <img src={task.image_url || uploadedUrl || ''} alt="Submitted proof" style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border-subtle)' }} />
            {task.worker_notes && (
              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--secondary)', fontStyle: 'italic' }}>&ldquo;{task.worker_notes}&rdquo;</div>
            )}
          </div>
        )}

        {/* Error / Success */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(193,68,14,.12)', border: '1px solid rgba(193,68,14,.3)', color: '#E8933A', fontSize: '13px', marginBottom: '1rem', fontFamily: "'Space Mono', monospace" }}>
            ⚠ {error}
          </div>
        )}
        {successMsg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(52,211,153,.12)', border: '1px solid rgba(52,211,153,.3)', color: '#34d399', fontSize: '13px', marginBottom: '1rem', fontFamily: "'Space Mono', monospace", display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} /> {successMsg}
          </div>
        )}

        {/* Action Buttons */}
        {!isCompleted && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {isPending && (
              <button
                onClick={() => updateStatus('IN_PROGRESS')}
                disabled={submitting}
                style={{
                  width: '100%', padding: '16px', borderRadius: '14px', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #E8933A, #C1440E)', color: 'white',
                  fontSize: '16px', fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={18} />}
                Arrived — Start Task
              </button>
            )}

            {(isInProgress || isPending) && (
              <button
                onClick={() => updateStatus('COMPLETED_UNVERIFIED')}
                disabled={submitting || !uploadedUrl}
                style={{
                  width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                  cursor: (submitting || !uploadedUrl) ? 'not-allowed' : 'pointer',
                  background: uploadedUrl ? 'linear-gradient(135deg, #34d399, #059669)' : 'var(--dark-surface)',
                  color: uploadedUrl ? 'white' : 'var(--secondary)',
                  fontSize: '16px', fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  border: uploadedUrl ? 'none' : '1px solid var(--border-subtle)',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={18} />}
                {uploadedUrl ? 'Submit — Mark Done' : 'Add Photo to Complete'}
              </button>
            )}
          </div>
        )}

        {isCompleted && (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.25)', borderRadius: '14px' }}>
            <CheckCircle2 size={36} color="#34d399" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: 4 }}>Submitted for Verification</div>
            <div style={{ fontSize: '13px', color: 'var(--secondary)' }}>Supervisor will review your proof of work</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
