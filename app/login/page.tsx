'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Truck, Droplets, Wrench, ArrowRight, ArrowLeft } from 'lucide-react';

const ROLES = [
  { id: 'admin', icon: Shield, label: 'Admin' },
  { id: 'sanitation', icon: Truck, label: 'Sanitation' },
  { id: 'water', icon: Droplets, label: 'Water' },
  { id: 'maintenance', icon: Wrench, label: 'Maintenance' },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState('admin');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem('nagarflow_role', selectedRole);
    router.push('/dashboard');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '16px', padding: '2.5rem', position: 'relative', overflow: 'hidden',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div className="login__logo" style={{ fontFamily: "'Playfair Display',serif", fontSize: '28px', color: 'var(--text-heading)', textAlign: 'center', marginBottom: '.25rem', fontWeight: 700 }}>
            NagarFlow
          </div>
          <div className="mono" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', textAlign: 'center', marginBottom: '2rem' }}>
            Smart City Command Center
          </div>

          <div className="form-group">
            <label className="form-label">Select Access Level</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.5rem' }}>
              {ROLES.map(r => {
                const Icon = r.icon;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRole(r.id)}
                    style={{
                      background: selectedRole === r.id ? 'rgba(193,68,14,.06)' : 'var(--dark-surface)',
                      border: `1px solid ${selectedRole === r.id ? 'var(--primary)' : 'var(--border-subtle)'}`,
                      borderRadius: '8px', padding: '1.25rem 1rem', textAlign: 'center', cursor: 'pointer',
                      transition: 'all .2s',
                      boxShadow: selectedRole === r.id ? '0 0 0 2px rgba(193,68,14,.1)' : 'none',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                    }}
                  >
                    <Icon size={24} color={selectedRole === r.id ? 'var(--primary)' : 'var(--secondary)'} strokeWidth={selectedRole === r.id ? 2.5 : 1.5} />
                    <div className="mono" style={{
                      fontSize: '11px',
                      color: selectedRole === r.id ? 'var(--primary)' : 'var(--text-body)',
                      fontWeight: selectedRole === r.id ? 700 : 500
                    }}>{r.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '1.5rem 0' }}></div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Identifier</label>
              <input className="input" type="text" placeholder="operator@nagarflow.ai" defaultValue="admin" />
            </div>
            <div className="form-group">
              <label className="form-label">Passkey</label>
              <input className="input" type="password" placeholder="••••••••" defaultValue="demo1234" />
            </div>
            <button className="btn btn--primary" type="submit" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '.75rem', justifyContent: 'center' }}>
              Authenticate <ArrowRight size={16} />
            </button>
          </form>

          <Link href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '1.5rem', fontSize: '12px', color: 'var(--secondary)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-heading)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--secondary)'}>
            <ArrowLeft size={14} /> Back to Hub
          </Link>
        </div>
      </div>
    </div>
  );
}
