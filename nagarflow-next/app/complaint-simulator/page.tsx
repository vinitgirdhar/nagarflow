'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  MessageSquareText,
  Radio,
  SendHorizonal,
  Sparkles,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import VoiceConversation from '../components/VoiceConversation';

const BACKEND_URL = 'http://127.0.0.1:5000';

const SAMPLE_SMS = [
  'Hi, I am from Andheri West near the subway and the drains are overflowing since morning. Please register a complaint.',
  'Garbage has not been cleared for 3 days in Dharavi 90 feet road. It is smelling very bad.',
  'Road near Powai lake garden signal has a huge pothole and bikes are skidding. Kindly take action.',
];

type ExtractedComplaint = {
  zone: string;
  issue_type: string;
  severity: string;
};

type ChatMessage = {
  speaker: 'agent' | 'user';
  text: string;
};

type LoggedComplaint = ExtractedComplaint & {
  source: 'voice_call' | 'text_chat';
};

export default function ComplaintSimulatorPage() {
  const [incomingSms, setIncomingSms] = useState(SAMPLE_SMS[0]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      speaker: 'agent',
      text: 'Complaint desk ready. Paste an SMS, then continue the chat with the resident details like area and issue to register a text complaint.',
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [lastLogged, setLastLogged] = useState<LoggedComplaint | null>(null);

  const lastLoggedLabel = useMemo(() => {
    if (!lastLogged) return 'waiting for first complaint';
    return `${lastLogged.zone} • ${lastLogged.issue_type}`;
  }, [lastLogged]);

  const submitChatMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorText('');
    setChatMessages((current) => [...current, { speaker: 'user', text: trimmed }]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/agent/respond-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not process the complaint message.');
      }

      setChatMessages((current) => [
        ...current,
        { speaker: 'agent', text: data.reply_text || 'Complaint simulator acknowledged the message.' },
      ]);

      if (data.complaint_logged && data.extracted) {
        setLastLogged({
          zone: data.extracted.zone,
          issue_type: data.extracted.issue_type,
          severity: data.extracted.severity,
          source: 'text_chat',
        });
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Could not reach the backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = chatInput;
    setChatInput('');
    await submitChatMessage(nextMessage);
  };

  const handleSmsInject = async () => {
    await submitChatMessage(incomingSms);
  };

  const cards = [
    { label: 'Voice Intake', value: 'LIVE', sub: 'Sarvam call flow moved here' },
    { label: 'SMS Payload', value: `${incomingSms.trim().length}`, sub: 'characters queued for chat' },
    { label: 'Chat Turns', value: String(chatMessages.length), sub: 'simulated resident conversation' },
    { label: 'Last Registered', value: lastLoggedLabel, sub: 'pushed into complaints feed' },
  ];

  return (
    <DashboardShell
      title="Complaint Simulator"
      badges={[
        { type: 'live', text: 'VOICE + TEXT' },
        { type: 'info', text: 'BACKEND CONNECTED' },
      ]}
    >
      <div className="page-header">
        <h1 className="page-header__title">Complaint Simulator</h1>
        <p className="page-header__sub">
          Run the full citizen intake simulation here: voice call handling, SMS intake, and text-chat complaint registration all flowing into the complaints page.
        </p>
      </div>

      <div className="stat-grid">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <div className="card__label">{card.label}</div>
            <div className="card__value" style={{ fontSize: card.label === 'Last Registered' ? '1.15rem' : undefined }}>
              {card.value}
            </div>
            <div className="card__sub">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2-1" style={{ alignItems: 'start', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="card card--glass" style={{ padding: '1.2rem' }}>
            <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
              <Radio size={16} />
              Sarvam Voice Simulation
            </div>
            <p className="card__sub" style={{ marginBottom: '1rem', lineHeight: 1.7 }}>
              Start a live voice complaint call here. Any extracted complaint is stored directly in the shared complaints backend and will appear in the admin complaints feed.
            </p>
            <VoiceConversation
              onTranscribed={(data) => {
                if (data && data.zone && data.issue_type) {
                  setLastLogged({
                    zone: data.zone,
                    issue_type: data.issue_type,
                    severity: data.severity,
                    source: 'voice_call',
                  });
                }
              }}
            />
          </div>

          <div className="card card--glass" style={{ padding: '1.2rem' }}>
            <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
              <Bot size={16} />
              Text Complaint Chatbot
            </div>
            <p className="card__sub" style={{ marginBottom: '1rem', lineHeight: 1.7 }}>
              Continue the resident conversation here. Mention the exact locality and issue to register the complaint from the chat flow.
            </p>

            {errorText ? (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--danger)',
                  padding: '0.7rem 0.85rem',
                  background: 'rgba(185,45,45,0.08)',
                  borderRadius: '10px',
                  border: '1px solid rgba(185,45,45,0.2)',
                  marginBottom: '1rem',
                }}
              >
                {errorText}
              </div>
            ) : null}

            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(207,195,178,0.85)',
                background: 'rgba(255,255,255,0.86)',
                padding: '1rem',
                display: 'grid',
                gap: '0.8rem',
                minHeight: '220px',
                maxHeight: '340px',
                overflowY: 'auto',
                marginBottom: '1rem',
              }}
            >
              {chatMessages.map((message, index) => {
                const isAgent = message.speaker === 'agent';
                return (
                  <div
                    key={`${message.speaker}-${index}`}
                    style={{ display: 'flex', justifyContent: isAgent ? 'flex-start' : 'flex-end' }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        borderRadius: isAgent ? '16px 16px 16px 6px' : '16px 16px 6px 16px',
                        padding: '0.8rem 0.9rem',
                        background: isAgent ? 'rgba(74,122,62,0.12)' : 'rgba(193,68,14,0.1)',
                        border: `1px solid ${isAgent ? 'rgba(74,122,62,0.22)' : 'rgba(193,68,14,0.2)'}`,
                      }}
                    >
                      <div
                        className="mono"
                        style={{
                          fontSize: '10px',
                          marginBottom: '0.2rem',
                          color: isAgent ? 'var(--accent)' : 'var(--primary)',
                        }}
                      >
                        {isAgent ? 'SIMULATOR' : 'OPERATOR'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-heading)', lineHeight: 1.65 }}>
                        {message.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleChatSubmit}>
              <div
                style={{
                  borderRadius: '16px',
                  border: '1px solid rgba(207,195,178,0.9)',
                  background: 'rgba(255,255,255,0.92)',
                  padding: '0.85rem',
                  display: 'grid',
                  gap: '0.75rem',
                }}
              >
                <textarea
                  className="input"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Example: Register a complaint for Kurla station road, there is a major pothole and waterlogging."
                  style={{
                    minHeight: '88px',
                    maxHeight: '140px',
                    resize: 'vertical',
                    width: '100%',
                    border: 'none',
                    boxShadow: 'none',
                    padding: '0',
                    background: 'transparent',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--secondary)' }}>
                    Include area + issue so the complaint can be registered.
                  </div>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={isSubmitting || !chatInput.trim()}
                    style={{
                      minWidth: '180px',
                      height: '42px',
                      justifyContent: 'center',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      boxShadow: '0 8px 20px rgba(193,68,14,0.12)',
                      padding: '0 0.95rem',
                    }}
                  >
                    <SendHorizonal size={15} />
                    {isSubmitting ? 'Sending...' : 'Send To Complaint Bot'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.2rem' }}>
            <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
              <MessageSquareText size={16} />
              SMS Intake Simulator
            </div>
            <p className="card__sub" style={{ marginBottom: '1rem', lineHeight: 1.7 }}>
              Paste the resident SMS here, then inject it into the chat workflow to simulate the complaint desk converting a message into a structured complaint.
            </p>

            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              {SAMPLE_SMS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => setIncomingSms(sample)}
                  style={{ fontSize: '11px' }}
                >
                  Load sample
                </button>
              ))}
            </div>

            <textarea
              className="input"
              value={incomingSms}
              onChange={(event) => setIncomingSms(event.target.value)}
              placeholder="Paste the SMS complaint here..."
              style={{ minHeight: '180px', resize: 'vertical', width: '100%' }}
            />

            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSmsInject}
              disabled={isSubmitting || !incomingSms.trim()}
              style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
            >
              <Sparkles size={16} />
              Inject SMS Into Chat
            </button>
          </div>

          <div className="card card--glass" style={{ padding: '1rem 1.1rem' }}>
            <div className="card__title" style={{ marginBottom: '.5rem' }}>Feed Sync Rule</div>
            <p className="card__sub" style={{ lineHeight: 1.7 }}>
              Once the chat captures both the area and the issue clearly, the simulator stores it as a <span className="mono">text complaint</span> and it becomes visible on the complaints page.
            </p>
            {lastLogged ? (
              <div
                style={{
                  marginTop: '.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.6rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(74,122,62,0.22)',
                  background: 'rgba(74,122,62,0.08)',
                  padding: '.8rem .9rem',
                }}
              >
                <CheckCircle2 size={16} color="var(--success)" />
                <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
                  Latest logged via <strong>{lastLogged.source === 'voice_call' ? 'voice call' : 'text chat'}</strong>:
                  {' '}<strong>{lastLogged.zone}</strong> for <strong>{lastLogged.issue_type}</strong> with{' '}
                  {lastLogged.severity.toLowerCase()} severity.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
