'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Wrench, ArrowRight, ArrowLeft } from 'lucide-react';

const ROLES = [
  { id: 'admin', icon: Shield, label: 'Admin Access', sub: 'Full Command' },
  { id: 'maintenance', icon: Wrench, label: 'Maintenance', sub: 'Field Ops' },
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
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media (max-width: 900px) {
          .login-branding { display: none !important; }
          .login-form-container { padding: 2rem !important; }
        }
      `}} />
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface)' }}>
        
        {/* Left Branding Side */}
        <div className="login-branding" style={{ flex: 1, background: 'var(--text-heading)', color: 'var(--surface)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4rem', position: 'relative', overflow: 'hidden' }}>
          
          {/* Subtle Grid Background */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4rem' }}>
              <div style={{ width: '12px', height: '12px', background: 'var(--primary)', borderRadius: '50%' }}></div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '24px', fontWeight: 800 }}>NagarFlow</div>
            </div>
            <h1 style={{ fontSize: 'clamp(40px, 4.5vw, 64px)', lineHeight: 1.1, marginBottom: '2rem', color: '#fff' }}>
              The city&apos;s nervous system.
            </h1>
            <p style={{ fontSize: '18px', color: 'var(--border-card)', maxWidth: '440px', lineHeight: 1.6 }}>
              Predict anomalies, streamline multi-agency dispatch, and correct equity gaps automatically before they escalate into civic emergencies.
            </p>
          </div>
          
          <div style={{ position: 'relative', zIndex: 1, fontFamily: "'Space Mono', monospace", fontSize: '12px', color: 'var(--secondary)' }}>
            System Core v2.1.4 <br />
            © 2026 NagarFlow Intelligence
          </div>
        </div>

        {/* Right Form Side */}
        <div className="login-form-container" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', position: 'relative', background: 'var(--bg)' }}>
          <div style={{ width: '100%', maxWidth: '420px' }}>
            
            <Link href="/" style={{ position: 'absolute', top: '2.5rem', right: '3rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--secondary)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-heading)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--secondary)'}>
              <ArrowLeft size={14} /> Back to Hub
            </Link>

            <div style={{ marginBottom: '3rem' }}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '36px', marginBottom: '.5rem', color: 'var(--text-heading)', fontWeight: 700 }}>Authenticate</h2>
              <p style={{ color: 'var(--secondary)', fontSize: '15px' }}>Enter credentials to access the command center.</p>
            </div>

            <div className="form-group" style={{ marginBottom: '2rem' }}>
              <label className="form-label" style={{ marginBottom: '1rem' }}>Select Access Level</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {ROLES.map(r => {
                  const Icon = r.icon;
                  const isActive = selectedRole === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRole(r.id)}
                      style={{
                        background: isActive ? 'rgba(193,68,14,.06)' : 'var(--surface)',
                        border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-subtle)'}`,
                        borderRadius: '12px', padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                        transition: 'all .2s',
                        boxShadow: isActive ? '0 0 0 2px rgba(193,68,14,.1)' : 'var(--shadow-sm)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                      }}
                    >
                      <Icon size={26} color={isActive ? 'var(--primary)' : 'var(--secondary)'} strokeWidth={isActive ? 2 : 1.5} />
                      <div>
                        <div className="mono" style={{
                          fontSize: '12px',
                          color: isActive ? 'var(--primary)' : 'var(--text-heading)',
                          fontWeight: isActive ? 700 : 600,
                          marginBottom: '4px'
                        }}>{r.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--secondary)' }}>{r.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2.5rem 0' }}></div>

            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Identifier</label>
                <input className="input" type="text" placeholder="operator@nagarflow.ai" defaultValue="admin" style={{ padding: '12px 16px', fontSize: '14px' }} />
              </div>
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label className="form-label">Passkey</label>
                <input className="input" type="password" placeholder="••••••••" defaultValue="demo1234" style={{ padding: '12px 16px', fontSize: '14px', letterSpacing: '0.1em' }} />
              </div>
              <button className="btn btn--primary" type="submit" style={{ width: '100%', padding: '14px', fontSize: '14px', justifyContent: 'center', fontWeight: 600 }}>
                Enter Dashboard <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
