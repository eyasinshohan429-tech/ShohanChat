import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { Peer, type MediaConnection } from 'peerjs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Profile, CallType } from '@/types';

type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface CallContextValue {
  callState: CallState;
  callType: CallType;
  direction: 'outgoing' | 'incoming';
  otherUser: Profile | null;
  callDuration: number;
  muted: boolean;
  cameraOff: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerReady: boolean;
  startCall: (type: CallType, otherUser: Profile, conversationId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerReady, setPeerReady] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const mediaConnRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callRecordIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string>('');
  const callStateRef = useRef<CallState>('idle');

  // Keep callStateRef in sync so callbacks can read current state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Timer for connected calls
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Initialize PeerJS — must live for the entire session, not just during calls
  useEffect(() => {
    if (!user) return;

    const peerId = `shohanchat_${user.id}`;
    const peer = new Peer(peerId, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', () => {
      setPeerReady(true);
    });

    peer.on('call', async (mediaConnection) => {
      // Incoming call arrived — store it and show notification
      mediaConnRef.current = mediaConnection;
      const meta = mediaConnection.metadata || {};
      const callerId = meta.callerId as string | undefined;
      const type = (meta.callType as CallType) ?? 'audio';

      setCallType(type);
      setDirection('incoming');
      setCallState('ringing');

      // Fetch caller's profile so we can show their name/avatar
      if (callerId) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', callerId)
          .maybeSingle();
        if (data) setOtherUser(data as Profile);
      }

      mediaConnection.on('close', () => {
        if (callStateRef.current !== 'idle') endCallInternal();
      });
      mediaConnection.on('error', () => {
        if (callStateRef.current !== 'idle') endCallInternal();
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err.type, err.message);
      // If peer ID is already taken (uniqueness-violation), try reconnecting
      if (err.type === 'unavailable-id') {
        setPeerReady(false);
      }
    });

    return () => {
      cleanupMedia();
      peer.destroy();
      peerRef.current = null;
      setPeerReady(false);
    };
  }, [user]);

  // Persistent audio element for remote audio playback.
  // Created once and reused — this is what actually produces sound.
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const attachRemoteAudio = (stream: MediaStream) => {
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      // Some browsers require an explicit play() call after user interaction
      audio.play().catch(() => {});
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
    }
    remoteAudioRef.current.srcObject = stream;
    remoteAudioRef.current.play().catch(() => {});
  };

  const cleanupMedia = () => {
    if (mediaConnRef.current) {
      try { mediaConnRef.current.close(); } catch { /* ignore */ }
      mediaConnRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    // Remove and clean up the persistent audio element
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.pause();
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
  };

  const updateCallRecord = useCallback(async (status: string) => {
    if (!callRecordIdRef.current) return;
    const update: Record<string, string> = { status };
    if (status === 'ended') update.ended_at = new Date().toISOString();
    await supabase.from('call_history').update(update).eq('id', callRecordIdRef.current);
  }, []);

  const endCallInternal = useCallback(() => {
    if (callStateRef.current === 'connected') {
      updateCallRecord('ended');
    } else if (callStateRef.current === 'ringing') {
      updateCallRecord('missed');
    }
    cleanupMedia();
    setCallState('idle');
    setMuted(false);
    setCameraOff(false);
    setOtherUser(null);
    callRecordIdRef.current = null;
    conversationIdRef.current = '';
  }, [updateCallRecord]);

  const startCall = useCallback(async (type: CallType, target: Profile, convId: string) => {
    if (!user || !peerRef.current || !peerReady) return;

    setCallType(type);
    setDirection('outgoing');
    setOtherUser(target);
    conversationIdRef.current = convId;
    setCallState('calling');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Create call record
      const { data: callRec } = await supabase.from('call_history').insert({
        conversation_id: convId,
        caller_id: user.id,
        receiver_id: target.id,
        call_type: type,
        status: 'incoming',
        started_at: new Date().toISOString(),
      }).select().single();
      callRecordIdRef.current = callRec?.id ?? null;

      const targetPeerId = `shohanchat_${target.id}`;
      const mediaConn = peerRef.current.call(targetPeerId, stream, {
        metadata: { callType: type, callerId: user.id },
      });
      mediaConnRef.current = mediaConn;

      mediaConn.on('stream', (remote) => {
        remoteStreamRef.current = remote;
        setRemoteStream(remote);
        attachRemoteAudio(remote);
        setCallState('connected');
        updateCallRecord('accepted');
      });

      mediaConn.on('close', () => {
        if (callStateRef.current !== 'idle') endCallInternal();
      });

      mediaConn.on('error', (err) => {
        console.error('Media connection error:', err);
        if (callStateRef.current !== 'idle') endCallInternal();
      });

      // Timeout: if no answer in 30s, end call
      setTimeout(() => {
        if (callStateRef.current === 'calling') {
          endCallInternal();
        }
      }, 30000);
    } catch (err) {
      console.error('Failed to start call:', err);
      endCallInternal();
    }
  }, [user, peerReady, updateCallRecord, endCallInternal]);

  const acceptCall = useCallback(async () => {
    if (!mediaConnRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      mediaConnRef.current.answer(stream);

      // For the receiver, the 'stream' event fires once the caller's stream arrives.
      // We attach it immediately to a persistent audio element so sound works.
      // Do NOT set 'connected' here — wait until the stream actually arrives.
      mediaConnRef.current.on('stream', (remote) => {
        remoteStreamRef.current = remote;
        setRemoteStream(remote);
        attachRemoteAudio(remote);
        setCallState('connected');
      });

      // Optimistically show connected state so the call UI advances past "ringing",
      // but the video view will show a placeholder until the remote stream arrives.
      setCallState('connected');
    } catch (err) {
      console.error('Failed to accept call:', err);
      endCallInternal();
    }
  }, [callType, endCallInternal]);

  const declineCall = useCallback(() => {
    if (mediaConnRef.current) {
      try { mediaConnRef.current.close(); } catch { /* ignore */ }
    }
    updateCallRecord('declined');
    endCallInternal();
  }, [updateCallRecord, endCallInternal]);

  const endCall = useCallback(() => {
    endCallInternal();
  }, [endCallInternal]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = muted));
      setMuted(!muted);
    }
  }, [muted]);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
      setCameraOff(!cameraOff);
    }
  }, [cameraOff]);

  return (
    <CallContext.Provider
      value={{
        callState,
        callType,
        direction,
        otherUser,
        callDuration,
        muted,
        cameraOff,
        localStream,
        remoteStream,
        peerReady,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
