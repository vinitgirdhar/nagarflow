'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Mic,
  Phone,
  PhoneOff,
  Square,
} from 'lucide-react';

type AgentPhase = 'idle' | 'greeting' | 'ready' | 'recording' | 'processing' | 'completed' | 'error';

interface ExtractedComplaint {
  zone: string;
  issue_type: string;
  severity: string;
}

interface ConversationTurn {
  speaker: 'agent' | 'user';
  text: string;
}

interface BrowserSpeechRecognitionResult {
  transcript: string;
}

interface BrowserSpeechRecognitionEvent {
  results: BrowserSpeechRecognitionResult[][];
}

interface BrowserSpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognitionCtor {
  new (): BrowserSpeechRecognitionLike;
}

interface AgentResponse {
  success: boolean;
  audio?: string | null;
  audio_format?: 'wav' | 'mp3' | null;
  call_ended?: boolean;
  complaint_logged?: boolean;
  error?: string;
  extracted?: ExtractedComplaint;
  reply_text?: string;
  transcript?: string;
  voice_mode?: 'sarvam' | 'browser';
}

const BACKEND_URL = 'http://127.0.0.1:5000';

export default function VoiceConversation({
  onTranscribed,
}: {
  onTranscribed?: (data: ExtractedComplaint) => void;
}) {
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [errorText, setErrorText] = useState('');
  const [lastExtracted, setLastExtracted] = useState<ExtractedComplaint | null>(null);
  const [useBrowserVoice, setUseBrowserVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognitionLike | null>(null);
  const cancelSubmitRef = useRef(false);

  function cleanupAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  function cleanupRecorder() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }

  function cleanupRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      cancelSubmitRef.current = true;
      cleanupAudio();
      cleanupRecorder();
      cleanupRecognition();
      window.speechSynthesis.cancel();
    };
  }, []);

  const resetSession = () => {
    cancelSubmitRef.current = true;
    cleanupAudio();
    cleanupRecorder();
    cleanupRecognition();
    window.speechSynthesis.cancel();
    setPhase('idle');
    setConversation([]);
    setErrorText('');
    setLastExtracted(null);
    setUseBrowserVoice(false);
  };

  const speakText = (text: string, onEnded?: () => void) => {
    const trimmed = text.trim();
    if (!trimmed) {
      onEnded?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = 'hi-IN';
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.onend = () => onEnded?.();
    utterance.onerror = () => onEnded?.();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const playAudio = async (base64Audio?: string | null, onEnded?: () => void, audioFormat?: string | null) => {
    cleanupAudio();

    if (!base64Audio) {
      onEnded?.();
      return;
    }

    const binary = atob(base64Audio);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const mimeType = audioFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audioRef.current = audio;
    audioUrlRef.current = url;

    audio.onended = () => {
      cleanupAudio();
      onEnded?.();
    };
    audio.onerror = () => {
      cleanupAudio();
      onEnded?.();
    };

    try {
      await audio.play();
    } catch {
      cleanupAudio();
      onEnded?.();
    }
  };

  const readAgentResponse = async (response: Response): Promise<AgentResponse> => {
    try {
      return (await response.json()) as AgentResponse;
    } catch {
      return { success: false, error: 'Unexpected response from the server.' };
    }
  };

  const playAgentReply = async (replyText?: string, base64Audio?: string | null, onEnded?: () => void, audioFormat?: string | null) => {
    if (base64Audio) {
      await playAudio(base64Audio, onEnded, audioFormat);
      return;
    }

    if (replyText) {
      speakText(replyText, onEnded);
      return;
    }

    onEnded?.();
  };

  const handleAgentReplyEnded = (callEnded?: boolean) => {
    if (callEnded) {
      setPhase('completed');
    } else {
      setPhase('ready');
      // Natural delay before opening the mic again to ensure user is ready
      setTimeout(() => {
        if (useBrowserVoice) {
          startBrowserRecognition();
        } else {
          startRecording();
        }
      }, 700);
    }
  };

  const startSession = async () => {
    cleanupAudio();
    cleanupRecorder();
    cleanupRecognition();
    setConversation([]);
    setLastExtracted(null);
    setErrorText('');
    setPhase('greeting');

    try {
      const response = await fetch(`${BACKEND_URL}/api/agent/greet`);
      const data = await readAgentResponse(response);

      if (!response.ok || !data.success || !data.reply_text) {
        setPhase('error');
        setErrorText(data.error || 'Could not start the demo agent.');
        return;
      }

      setUseBrowserVoice(data.voice_mode === 'browser' || (!data.audio && data.voice_mode !== 'sarvam'));
      setConversation([{ speaker: 'agent', text: data.reply_text }]);
      await playAgentReply(data.reply_text, data.audio, () => handleAgentReplyEnded(data.call_ended), data.audio_format);
    } catch {
      setPhase('error');
      setErrorText('Could not reach the backend. Start app.py and try again.');
    }
  };

  const submitComplaint = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    setPhase('processing');
    setErrorText('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/agent/respond`, {
        method: 'POST',
        body: formData,
      });
      const data = await readAgentResponse(response);

      if (!response.ok || !data.success || !data.reply_text) {
        setPhase('error');
        setErrorText(data.error || 'The agent could not process that recording.');
        return;
      }

      setConversation((current) => {
        const next = [...current];
        if (data.transcript) {
          next.push({ speaker: 'user', text: data.transcript });
        }
        next.push({ speaker: 'agent', text: data.reply_text! });
        return next;
      });

      if (data.complaint_logged && data.extracted) {
        setLastExtracted(data.extracted);
        onTranscribed?.(data.extracted);
      }

      await playAgentReply(data.reply_text, data.audio, () => {
        handleAgentReplyEnded(data.call_ended);
      }, data.audio_format);
    } catch {
      setPhase('error');
      setErrorText('The backend could not process your audio. Please try again.');
    }
  };

  const submitTranscript = async (transcript: string) => {
    setPhase('processing');
    setErrorText('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/agent/respond-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await readAgentResponse(response);

      if (!response.ok || !data.success || !data.reply_text) {
        setPhase('error');
        setErrorText(data.error || 'The agent could not process that recording.');
        return;
      }

      setConversation((current) => [
        ...current,
        { speaker: 'user', text: transcript },
        { speaker: 'agent', text: data.reply_text! },
      ]);

      if (data.complaint_logged && data.extracted) {
        setLastExtracted(data.extracted);
        onTranscribed?.(data.extracted);
      }

      await playAgentReply(data.reply_text, data.audio, () => {
        handleAgentReplyEnded(data.call_ended);
      }, data.audio_format);
    } catch {
      setPhase('error');
      setErrorText('The backend could not process your transcript. Please try again.');
    }
  };

  const startBrowserRecognition = async () => {
    const SpeechRecognitionCtor =
      ((window as Window & {
        SpeechRecognition?: BrowserSpeechRecognitionCtor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
      }).SpeechRecognition ||
        (window as Window & {
          SpeechRecognition?: BrowserSpeechRecognitionCtor;
          webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
        }).webkitSpeechRecognition) as BrowserSpeechRecognitionCtor | undefined;

    if (!SpeechRecognitionCtor) {
      setPhase('error');
      setErrorText('Browser speech recognition is not supported here. Please use Chrome or Edge.');
      return;
    }

    cleanupRecognition();
    cleanupAudio();
    setErrorText('');

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'hi-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = async (event: BrowserSpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
      cleanupRecognition();

      if (!transcript) {
        setPhase('ready');
        setErrorText('I could not hear that clearly. Please try again.');
        return;
      }

      await submitTranscript(transcript);
    };

    recognition.onerror = () => {
      cleanupRecognition();
      setPhase('error');
      setErrorText('Browser speech recognition failed. Please try again.');
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        cleanupRecognition();
        setPhase('ready');
      }
    };

    recognition.start();
    setPhase('recording');
  };

  const startRecording = async () => {
    if (phase !== 'ready') {
      return;
    }

    if (useBrowserVoice) {
      await startBrowserRecognition();
      return;
    }

    setErrorText('');
    cleanupAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      cancelSubmitRef.current = false;

      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const wasCancelled = cancelSubmitRef.current;
        cancelSubmitRef.current = false;
        cleanupRecorder();

        if (wasCancelled) {
          return;
        }

        if (blob.size < 1000) {
          setPhase('ready');
          setErrorText('Recording was too short. Please hold the mic a little longer.');
          return;
        }

        await submitComplaint(blob);
      };

      recorder.start(200);
      setPhase('recording');
    } catch {
      setPhase('error');
      setErrorText('Microphone access was denied. Please allow access and try again.');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && phase === 'recording') {
      recognitionRef.current.stop();
      setPhase('processing');
      return;
    }

    if (mediaRecorderRef.current && phase === 'recording') {
      mediaRecorderRef.current.stop();
      setPhase('processing');
    }
  };

  const getStatusText = () => {
    switch (phase) {
      case 'greeting':
        return 'Connecting...';
      case 'ready':
        return useBrowserVoice ? 'Connected · Browser voice mode' : 'Connected · Agent listening';
      case 'recording':
        return 'Recording your voice...';
      case 'processing':
        return 'Agent is thinking...';
      case 'completed':
        return 'Call ended';
      case 'error':
        return errorText || 'Call failed.';
      default:
        return 'Ready to call';
    }
  };

  const primaryButtonLabel = phase === 'recording' ? 'Stop Recording' : 'Speak Now';
  const primaryButtonIcon = phase === 'recording' ? <Square size={16} /> : <Mic size={16} />;

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(242,237,229,0.96) 100%)',
        border: `1px solid ${
          phase === 'recording' ? 'rgba(185,45,45,0.45)' : 'rgba(207,195,178,0.95)'
        }`,
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow:
          phase === 'recording'
            ? '0 16px 40px rgba(185,45,45,0.16)'
            : '0 16px 36px rgba(28,20,16,0.08)',
      }}
    >
      <div
        style={{
          padding: '1rem 1.1rem',
          borderBottom: '1px solid rgba(207,195,178,0.8)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(193,68,14,0.14), rgba(74,122,62,0.18))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              flexShrink: 0,
              position: 'relative'
            }}
          >
            {(phase === 'processing' || phase === 'greeting' || phase === 'recording') ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '16px' }}>
                <div style={{ width: '4px', background: 'var(--primary)', borderRadius: '2px', animation: 'wave 1s ease-in-out infinite' }}></div>
                <div style={{ width: '4px', background: 'var(--accent)', borderRadius: '2px', animation: 'wave 1.2s ease-in-out infinite 0.2s' }}></div>
                <div style={{ width: '4px', background: 'var(--primary)', borderRadius: '2px', animation: 'wave 0.8s ease-in-out infinite 0.4s' }}></div>
              </div>
            ) : (
              <Bot size={20} />
            )}
            <style jsx>{`
              @keyframes wave {
                0%, 100% { height: 6px; }
                50% { height: 16px; }
              }
            `}</style>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)' }}>
                NagarFlow AI Agent
              </div>
            </div>
            {(phase !== 'idle' && phase !== 'completed') && (
              <div style={{ fontSize: '12px', color: phase === 'error' ? 'var(--danger)' : 'var(--accent)', marginTop: '0.2rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: phase === 'error' ? 'var(--danger)' : 'var(--accent)', display: 'inline-block', animation: (phase === 'recording' || phase === 'processing') ? 'pulse 1.5s infinite' : 'none' }}></span>
                {getStatusText()}
                {useBrowserVoice ? (
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--accent)' }}>
                    browser fallback
                  </span>
                ) : null}
              </div>
            )}
            {phase === 'idle' && (
            <div style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '0.2rem' }}>
                Tap the phone icon to start call.
              </div>
            )}
          </div>
        </div>

        {phase === 'idle' || phase === 'completed' ? (
          <button
            onClick={startSession}
            suppressHydrationWarning
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--success)',
              color: 'white',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(74,122,62,0.3)',
              transition: 'transform 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Phone size={18} fill="currentColor" />
          </button>
        ) : phase === 'processing' || phase === 'greeting' ? (
          <button
            onClick={resetSession}
            suppressHydrationWarning
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--danger)',
              color: 'white',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(185,45,45,0.3)'
            }}
          >
            <PhoneOff size={18} />
          </button>
        ) : (
          <button
            onClick={resetSession}
            suppressHydrationWarning
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--danger)',
              color: 'white',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(185,45,45,0.3)',
              transition: 'transform 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <PhoneOff size={18} />
          </button>
        )}
      </div>

      <div style={{ padding: '1rem 1.1rem', display: 'grid', gap: '1rem' }}>
        {phase === 'error' && (
          <div style={{ fontSize: '13px', color: 'var(--danger)', padding: '0.5rem', background: 'rgba(185,45,45,0.08)', borderRadius: '8px', border: '1px solid rgba(185,45,45,0.2)' }}>
            {errorText}
          </div>
        )}

        {(phase === 'ready' || phase === 'recording') && (
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <button
              onClick={phase === 'recording' ? stopRecording : startRecording}
              suppressHydrationWarning
              style={{
                width: '100%',
                maxWidth: '200px',
                padding: '0.75rem',
                borderRadius: '24px',
                background: phase === 'recording' ? 'var(--danger)' : 'var(--primary)',
                color: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: phase === 'recording' ? '0 8px 24px rgba(185,45,45,0.4)' : '0 4px 12px rgba(193,68,14,0.2)',
                transition: 'all 0.2s',
                transform: phase === 'recording' ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              {primaryButtonIcon}
              {primaryButtonLabel}
            </button>
          </div>
        )}

        {conversation.length > 0 && (
          <div
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(207,195,178,0.85)',
              background: 'rgba(255,255,255,0.84)',
              padding: '0.95rem',
              display: 'grid',
              gap: '0.7rem',
            }}
          >
            {conversation.map((turn, index) => {
              const isAgent = turn.speaker === 'agent';
              return (
                <div
                  key={`${turn.speaker}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: isAgent ? 'flex-start' : 'flex-end',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      borderRadius: isAgent ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                      padding: '0.7rem 0.85rem',
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
                      {isAgent ? 'AGENT' : 'YOU SAID'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-heading)', lineHeight: 1.55 }}>
                      {turn.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lastExtracted && lastExtracted.zone !== 'Unknown' && lastExtracted.issue_type !== 'Unknown' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              borderRadius: '14px',
              border: '1px solid rgba(74,122,62,0.24)',
              background: 'rgba(74,122,62,0.08)',
              padding: '0.8rem 0.95rem',
            }}
          >
            <CheckCircle2 size={16} color="var(--success)" />
            <div style={{ fontSize: '12px', color: 'var(--text-heading)' }}>
              Complaint logged for <strong>{lastExtracted.zone}</strong> as <strong>{lastExtracted.issue_type}</strong>
              {' '}with {lastExtracted.severity.toLowerCase()} severity. The agent will now ask if there is anything else to report.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
