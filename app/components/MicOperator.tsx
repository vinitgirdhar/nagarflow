import { useState, useRef } from 'react';
import { Mic, Square, Loader } from 'lucide-react';

export default function MicOperator({ onTranscribed }: { onTranscribed?: (data: any) => void }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async (e: any) => {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = (e: any) => {
    e.preventDefault();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setProcessing(true);
    }
  };

  const handleAudioUpload = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    try {
      const res = await fetch('http://127.0.0.1:5000/api/voice-ingest', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (onTranscribed) onTranscribed(data.extracted);
        if(!data.success) {
           alert("Flask processed it but Gemini hit an error: Check server logs. Make sure GEMINI_API_KEY is placed in .env and restart app.py!");
        }
      } else {
        alert("Audio processing failed! Ensure GEMINI_API_KEY is in .env and you restarted app.py.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ background: recording ? 'rgba(193, 68, 14, 0.1)' : 'var(--dark-surface)', border: `1px solid ${recording ? 'var(--danger)' : 'var(--border-subtle)'}`, padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.3s' }}>
      <div>
         <div style={{ fontSize: '13px', fontWeight: 600, color: recording ? 'var(--danger)' : 'var(--text-heading)'}}>{recording ? 'REC Live: Capturing Incident...' : processing ? 'Gemini 1.5 Flash processing...' : 'Direct Voice Dispatch (Gemini)'}</div>
         <div className="mono" style={{ fontSize: '10px', color: 'var(--secondary)'}}>Hold to inject natural language report straight to DB.</div>
      </div>
      
      {processing ? (
         <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader className="spin" color="var(--primary)" /></div>
      ) : (
         <button 
           onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={recording ? stopRecording : undefined}
           onTouchStart={startRecording} onTouchEnd={stopRecording}
           style={{ background: recording ? 'var(--danger)' : 'var(--primary)', border: 'none', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.1s', transform: recording ? 'scale(1.1)' : 'scale(1)'}}>
             {recording ? <Square fill="white" color="white" size={16} /> : <Mic color="white" />}
         </button>
      )}
    </div>
  );
}
