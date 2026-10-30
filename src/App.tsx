import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { CallProvider, useCall } from '@/context/CallContext';
import { supabase } from '@/lib/supabase';
import AuthScreen from '@/components/AuthScreen';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import SettingsPanel from '@/components/SettingsPanel';
import CallOverlay, { IncomingCallBanner } from '@/components/CallOverlay';
import type { Profile, CallType } from '@/types';
import { Loader2, MessageCircle } from 'lucide-react';

type View = 'chat' | 'settings';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const { startCall } = useCall();
  const [view, setView] = useState<View>('chat');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeOtherUser, setActiveOtherUser] = useState<Profile | null>(null);
  const [isSelfChat, setIsSelfChat] = useState(false);

  // Set user online on mount, offline on unmount
  useEffect(() => {
    if (!user) return;

    supabase.from('profiles').update({ online: true, last_seen: new Date().toISOString() }).eq('id', user.id).then();

    const handleVisibility = () => {
      if (document.hidden) {
        supabase.from('profiles').update({ online: false, last_seen: new Date().toISOString() }).eq('id', user.id).then();
      } else {
        supabase.from('profiles').update({ online: true, last_seen: new Date().toISOString() }).eq('id', user.id).then();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    const handleBeforeUnload = () => {
      navigator.sendBeacon(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
        new Blob([JSON.stringify({ online: false, last_seen: new Date().toISOString() })], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      supabase.from('profiles').update({ online: false, last_seen: new Date().toISOString() }).eq('id', user.id).then();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center shadow-lg animate-bounce-soft">
            <MessageCircle className="w-7 h-7 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthScreen />;
  }

  const handleSelectConversation = (id: string, otherUser: Profile | null, selfChat: boolean) => {
    setActiveConversationId(id);
    setActiveOtherUser(otherUser);
    setIsSelfChat(selfChat);
    setView('chat');
  };

  const handleStartCall = (type: CallType) => {
    if (activeOtherUser && activeConversationId) {
      startCall(type, activeOtherUser, activeConversationId);
    }
  };

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar - hidden on mobile when a chat is open */}
      <div className={`w-full md:w-80 lg:w-96 shrink-0 ${activeConversationId && view === 'chat' ? 'hidden md:block' : 'block'}`}>
        {view === 'settings' ? (
          <SettingsPanel onBack={() => setView('chat')} />
        ) : (
          <Sidebar
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onOpenSettings={() => setView('settings')}
          />
        )}
      </div>

      {/* Chat area */}
      <div className={`flex-1 ${activeConversationId && view === 'chat' ? 'block' : 'hidden md:block'}`}>
        {activeConversationId && view === 'chat' ? (
          <ChatWindow
            conversationId={activeConversationId}
            otherUser={activeOtherUser}
            isSelfChat={isSelfChat}
            onBack={() => { setActiveConversationId(null); setActiveOtherUser(null); }}
            onStartCall={handleStartCall}
            onConversationDeleted={() => { setActiveConversationId(null); setActiveOtherUser(null); }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
            <div className="w-20 h-20 bg-gradient-to-br from-brand-400 to-brand-600 rounded-3xl flex items-center justify-center shadow-xl mb-4">
              <MessageCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200">ShohanChat</h2>
            <p className="text-sm text-slate-400 mt-1">Select a conversation to start messaging</p>
          </div>
        )}
      </div>

      {/* Call overlay — always mounted so incoming calls work even without an open chat */}
      <CallOverlay />
      <IncomingCallBanner />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>
          <AppContent />
        </CallProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
