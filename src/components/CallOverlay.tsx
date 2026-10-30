import { useEffect, useRef } from 'react';
import { useCall } from '@/context/CallContext';
import { getDisplayName, formatDuration } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, PhoneIncoming } from 'lucide-react';

export default function CallOverlay() {
  const {
    callState,
    callType,
    direction,
    otherUser,
    callDuration,
    muted,
    cameraOff,
    peerReady,
    endCall,
    acceptCall,
    declineCall,
    toggleMute,
    toggleCamera,
  } = useCall();

  if (callState === 'idle') return null;

  const otherName = otherUser ? getDisplayName(otherUser.display_name, '') : 'Unknown';
  const isVideo = callType === 'video';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 animate-fade-in">
      {isVideo ? (
        <VideoLayout />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="relative mb-6">
            {(callState === 'ringing' || callState === 'calling') && (
              <>
                <div className="absolute inset-0 rounded-full animate-pulse-ring bg-brand-500/30" />
                <div
                  className="absolute inset-0 rounded-full animate-pulse-ring bg-brand-500/20"
                  style={{ animationDelay: '0.3s' }}
                />
              </>
            )}
            <Avatar src={otherUser?.avatar_url} name={otherName} size="xl" />
          </div>

          <h2 className="text-xl font-semibold text-white mb-1">{otherName}</h2>
          <p className="text-slate-400 text-sm">
            {callState === 'calling' && 'Calling...'}
            {callState === 'ringing' && 'Incoming call'}
            {callState === 'connected' && formatDuration(callDuration)}
            {callState === 'ended' && 'Call ended'}
          </p>
          <p className="text-slate-500 text-xs mt-1 capitalize">{callType} call</p>

          {!peerReady && (
            <p className="text-slate-500 text-xs mt-4">Connecting to call service...</p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="p-8 flex justify-center gap-4 bg-slate-900/90 backdrop-blur-sm">
        {callState === 'ringing' && direction === 'incoming' ? (
          <>
            <button
              onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all hover:scale-105"
              title="Decline"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <button
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-all hover:scale-105 animate-bounce-soft"
              title="Accept"
            >
              <Phone className="w-7 h-7 text-white" />
            </button>
          </>
        ) : (
          <>
            {isVideo && (
              <button
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 ${
                  cameraOff ? 'bg-white text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
                title={cameraOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
            )}
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 ${
                muted ? 'bg-white text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all hover:scale-105"
              title="End call"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VideoLayout() {
  const { callState, direction, otherUser, callDuration, localStream, remoteStream } = useCall();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Attach local stream — available immediately after getUserMedia
  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream && el.srcObject !== localStream) {
      el.srcObject = localStream;
      el.play().catch(() => {});
    }
  }, [localStream]);

  // Attach remote stream — arrives when the other person's stream comes through
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && remoteStream && el.srcObject !== remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => {});
    }
  }, [remoteStream]);

  const otherName = otherUser ? getDisplayName(otherUser.display_name, '') : 'Unknown';
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Remote video — full screen. Always mounted so stream attaches as soon as it arrives. */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover bg-slate-800"
      />

      {/* Placeholder over remote video when no remote stream yet */}
      {!hasRemoteVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
          <div className="relative mb-6">
            {(callState === 'ringing' || callState === 'calling') && (
              <>
                <div className="absolute inset-0 rounded-full animate-pulse-ring bg-brand-500/30" />
                <div
                  className="absolute inset-0 rounded-full animate-pulse-ring bg-brand-500/20"
                  style={{ animationDelay: '0.3s' }}
                />
              </>
            )}
            <Avatar src={otherUser?.avatar_url} name={otherName} size="xl" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-1">{otherName}</h2>
          <p className="text-slate-400 text-sm">
            {callState === 'calling' && 'Calling...'}
            {callState === 'ringing' && 'Incoming call'}
            {callState === 'connected' && 'Connecting video...'}
            {callState === 'ended' && 'Call ended'}
          </p>
        </div>
      )}

      {/* Status bar at top */}
      {callState === 'connected' && hasRemoteVideo && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
          <span className="text-white text-sm font-medium">{formatDuration(callDuration)}</span>
        </div>
      )}

      {/* Local video — picture-in-picture. Always mounted so stream attaches immediately. */}
      <div className="absolute top-4 right-4 w-32 h-24 sm:w-40 sm:h-28 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-slate-800 z-10">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
}

export function IncomingCallBanner() {
  const { callState, direction, callType, otherUser, acceptCall, declineCall } = useCall();

  if (callState !== 'ringing' || direction !== 'incoming') return null;
  if (!otherUser) return null;

  const name = getDisplayName(otherUser.display_name, '');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-slide-up">
        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full animate-pulse-ring bg-brand-500/30" />
            <Avatar src={otherUser.avatar_url} name={name} size="xl" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <PhoneIncoming className="w-4 h-4" />
            Incoming {callType} call
          </p>

          <div className="flex gap-6 mt-8">
            <button onClick={declineCall} className="flex flex-col items-center gap-2 group">
              <div className="w-16 h-16 rounded-full bg-red-500 group-hover:bg-red-600 flex items-center justify-center shadow-lg transition-all group-hover:scale-105">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs font-medium text-slate-500">Decline</span>
            </button>
            <button onClick={acceptCall} className="flex flex-col items-center gap-2 group">
              <div className="w-16 h-16 rounded-full bg-green-500 group-hover:bg-green-600 flex items-center justify-center shadow-lg transition-all group-hover:scale-105 animate-bounce-soft">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs font-medium text-slate-500">Accept</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
