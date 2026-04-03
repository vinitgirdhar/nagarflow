'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const ROLES = [
  { id: 'admin', icon: '👑', label: 'Admin' },
  { id: 'sanitation', icon: '🚛', label: 'Sanitation' },
  { id: 'water', icon: '💧', label: 'Water' },
  { id: 'maintenance', icon: '🔧', label: 'Maintenance' },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState('admin');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem('urbanpulse_role', selectedRole);
    router.push('/dashboard');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '16px', padding: '2.5rem', position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,.08)'
        }}>
          <div className="login__logo" style={{ fontFamily: "'Playfair Display',serif", fontSize: '28px', color: 'var(--text-heading)', textAlign: 'center', marginBottom: '.25rem' }}>
            UrbanPulse AI
          </div>
          <div className="mono" style={{ fontSize: '12px', color: 'var(--accent)', textAlign: 'center', marginBottom: '2rem' }}>
            Smart City Command Center
          </div>

          <div className="form-group">
            <label className="form-label">Select Role</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.5rem' }}>
              {ROLES.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelectedRole(r.id)}
                  style={{
                    background: selectedRole === r.id ? 'rgba(193,68,14,.06)' : 'var(--dark-surface)',
                    border: `1px solid ${selectedRole === r.id ? 'var(--primary)' : 'var(--border-subtle)'}`,
                    borderRadius: '8px', padding: '1rem', textAlign: 'center', cursor: 'pointer',
                    transition: 'all .2s',
                    boxShadow: selectedRole === r.id ? '0 0 0 3px rgba(193,68,14,.08)' : 'none'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '.4rem' }}>{r.icon}</div>
                  <div className="mono" style={{
                    fontSize: '11px',
                    color: selectedRole === r.id ? 'var(--primary)' : 'var(--secondary)',
                    fontWeight: selectedRole === r.id ? 700 : 400
                  }}>{r.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '1.5rem 0' }}></div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="input" type="text" placeholder="operator@urbanpulse.ai" defaultValue="admin" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="input" type="password" placeholder="••••••••" defaultValue="demo1234" />
            </div>
            <button className="btn btn--primary" type="submit" style={{ width: '100%', padding: '12px', fontSize: '14px', marginTop: '.5rem', justifyContent: 'center' }}>
              Enter Command Center →
            </button>
          </form>

          <Link href="/" style={{ display: 'block', textAlign: 'center', marginTop: '1.5rem', fontSize: '12px', color: 'var(--secondary)', textDecoration: 'none' }}>
            ← Back to Landing
          </Link>
        </div>
      </div>
    </div>
  );
}
