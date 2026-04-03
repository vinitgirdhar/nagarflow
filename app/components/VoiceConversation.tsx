import { useState, useRef } from 'react';
import { Mic, Square, Loader, Volume2, CheckCircle } from 'lucide-react';

interface ConversationTurn {
  role: 'user' | 'ai';
  text: string;
}

export default function VoiceConversation({ onTranscribed }: { onTranscribed?: (data: any) => void }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [lastExtracted, setLastExtracted] = useState<any>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async (e: any) => {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await handleConversation(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setRecording(true);
    } catch {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = (e: any) => {
    e.preventDefault();
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setProcessing(true);
    }
  };

  const handleConversation = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    try {
      const res = await fetch('http://127.0.0.1:5000/api/voice-conversation', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();

        if (!data.success) {
          // CRASH FIX: guard against undefined extracted before calling onTranscribed
          setConversation(prev => [...prev, { role: 'ai', text: `Error: ${data.error || 'Check your API keys in .env and restart app.py.'}` }]);
          setProcessing(false);
          return;
        }

        // User's spoken words
        if (data.transcript) {
          setConversation(prev => [...prev, { role: 'user', text: data.transcript }]);
        }

        // AI's confirmation reply text
        if (data.reply_text) {
          setConversation(prev => [...prev, { role: 'ai', text: data.reply_text }]);
        }

        // Save extracted data and bubble up - SAFE: only call if data.extracted exists
        if (data.extracted && data.extracted.zone) {
          setLastExtracted(data.extracted);
          if (onTranscribed) onTranscribed(data.extracted);
        }

        // Play Sarvam TTS audio reply
        if (data.confirmation_audio) {
          setPlaying(true);
          const audioBytes = atob(data.confirmation_audio);
          const byteArray = new Uint8Array(audioBytes.length);
          for (let i = 0; i < audioBytes.length; i++) byteArray[i] = audioBytes.charCodeAt(i);
          const audioBlob = new Blob([byteArray], { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.onended = () => { setPlaying(false); URL.revokeObjectURL(audioUrl); };
          audio.play().catch(() => setPlaying(false));
        }
      } else {
        setConversation(prev => [...prev, { role: 'ai', text: 'Connection failed. Check that app.py is running.' }]);
      }
    } catch (e) {
      setConversation(prev => [...prev, { role: 'ai', text: 'Could not reach back-end. Check app.py.' }]);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusLabel = () => {
    if (recording) return '🔴 Listening...';
    if (processing) return '⚙️ Sarvam STT + Gemini NLU...';
    if (playing) return '🔊 Sarvam AI speaking...';
    return 'Hold mic to report an incident';
  };

  return (
    <div style={{ background: 'var(--dark-surface)', border: `1px solid ${recording ? 'var(--danger)' : 'var(--border-subtle)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.3s' }}>

      {/* Header */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>🎙️ Sarvam AI Voice Channel</div>
          <div className="mono" style={{ fontSize: '10px', color: playing ? 'var(--primary)' : 'var(--secondary)' }}>{getStatusLabel()}</div>
        </div>

        {processing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', height: '42px' }}>
            <Loader size={20} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : playing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', height: '42px', background: 'rgba(122,140,94,0.2)', borderRadius: '50%' }}>
            <Volume2 size={20} color="var(--primary)" />
          </div>
        ) : (
          <button
            onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={recording ? stopRecording : undefined}
            onTouchStart={startRecording} onTouchEnd={stopRecording}
            style={{ background: recording ? 'var(--danger)' : 'var(--primary)', border: 'none', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transform: recording ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.15s', boxShadow: recording ? '0 0 20px rgba(193,68,14,0.6)' : 'none' }}>
            {recording ? <Square fill="white" color="white" size={14} /> : <Mic color="white" size={18} />}
          </button>
        )}
      </div>

      {/* Conversation History */}
      {conversation.length > 0 && (
        <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {conversation.map((turn, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '0.4rem 0.75rem', borderRadius: turn.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: turn.role === 'user' ? 'rgba(193,68,14,0.15)' : 'rgba(122,140,94,0.15)',
                border: `1px solid ${turn.role === 'user' ? 'rgba(193,68,14,0.3)' : 'rgba(122,140,94,0.3)'}`,
                fontSize: '11px', color: 'var(--text-heading)', lineHeight: 1.5
              }}>
                <span style={{ fontSize: '9px', color: 'var(--secondary)', display: 'block', marginBottom: '2px' }}>{turn.role === 'user' ? 'YOU' : '🤖 NAGAR AI'}</span>
                {turn.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pill showing extracted data */}
      {lastExtracted && lastExtracted.zone && (
        <div style={{ margin: '0 0.75rem 0.75rem', background: 'rgba(122,140,94,0.1)', border: '1px solid rgba(122,140,94,0.3)', borderRadius: '8px', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '11px' }}>
          <CheckCircle size={14} color="var(--primary)" />
          <span style={{ color: 'var(--text-heading)' }}>Logged: <b>{lastExtracted.zone}</b> · {lastExtracted.issue_type} · {lastExtracted.severity}</span>
        </div>
      )}
    </div>
  );
}
