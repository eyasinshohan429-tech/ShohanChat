import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { ConversationWithDetails, SearchResult, Profile } from '@/types';
import { getDisplayName, formatLastSeen, formatTime } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import { Search, Settings, MessageCircle, Bookmark, X, Loader2, MessageSquarePlus, Moon, Sun, Archive } from 'lucide-react';

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string, otherUser: Profile | null, isSelfChat: boolean) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({ activeConversationId, onSelectConversation, onOpenSettings }: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const convsWithDetails: ConversationWithDetails[] = await Promise.all(
      (data as ConversationWithDetails[]).map(async (conv) => {
        const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
        let otherUser: Profile | undefined;

        if (conv.is_self_chat) {
          otherUser = profile ?? undefined;
        } else {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .maybeSingle();
          otherUser = prof as Profile | undefined;
        }

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, message_type, sender_id, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...conv,
          other_user: otherUser,
          last_message: lastMsg
            ? { content: lastMsg.content, message_type: lastMsg.message_type, sender_id: lastMsg.sender_id, created_at: lastMsg.created_at }
            : null,
        };
      })
    );

    convsWithDetails.sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at;
      const bTime = b.last_message?.created_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setConversations(convsWithDetails);
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => loadConversations()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        () => loadConversations()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => loadConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_users', { query: searchQuery.trim() });
      if (!error && data) {
        setSearchResults(data as SearchResult[]);
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const startChatWithUser = async (otherUserId: string) => {
    if (!user) return;
    const { data: convId, error } = await supabase.rpc('create_or_get_conversation', {
      other_user: otherUserId,
    });

    if (error || !convId) return;

    const { data: otherProf } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId)
      .maybeSingle();

    setSearchQuery('');
    setShowSearch(false);
    await loadConversations();
    onSelectConversation(convId, otherProf as Profile | null, false);
  };

  const openSelfChat = async () => {
    if (!user) return;
    const { data: convId, error } = await supabase.rpc('create_or_get_conversation', {
      other_user: user.id,
    });

    if (error || !convId) return;
    await loadConversations();
    onSelectConversation(convId, profile, true);
  };

  const handleSelectConversation = (conv: ConversationWithDetails) => {
    onSelectConversation(conv.id, conv.other_user ?? null, conv.is_self_chat);
  };

  const displayName = profile ? getDisplayName(profile.display_name, user?.email ?? '') : (user?.email ?? '');

  const renderLastMessagePreview = (conv: ConversationWithDetails) => {
    if (!conv.last_message) return 'No messages yet';
    const prefix = conv.last_message.sender_id === user?.id ? 'You: ' : '';
    if (conv.last_message.message_type === 'image') return `${prefix}Photo`;
    if (conv.last_message.message_type === 'file') return `${prefix}${conv.last_message.content || 'File'}`;
    if (conv.last_message.message_type === 'audio') return `${prefix}Voice message`;
    if (conv.last_message.message_type === 'gif') return `${prefix}GIF`;
    if (conv.last_message.message_type === 'sticker') return `${prefix}${conv.last_message.content || 'Sticker'}`;
    return prefix + (conv.last_message.content || '');
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center shadow-md shadow-brand-500/20">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">ShohanChat</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              title="Settings"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearch(true);
            }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setShowSearch(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Search results overlay */}
        {showSearch && searchQuery ? (
          <div className="p-2">
            <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Search Results
            </div>
            {searching ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                No users found
              </div>
            ) : (
              searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => startChatWithUser(result.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <Avatar src={result.avatar_url} name={result.display_name || result.email} online={result.online} showStatus />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {getDisplayName(result.display_name, result.email)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {result.nickname ? `${result.nickname} · ` : ''}{result.email}
                    </p>
                  </div>
                  <MessageSquarePlus className="w-4 h-4 text-brand-500 shrink-0" />
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Saved Messages / Notes to Self */}
            <div className="p-2">
              <button
                onClick={openSelfChat}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                  activeConversationId && conversations.find(c => c.id === activeConversationId)?.is_self_chat
                    ? 'bg-brand-50 dark:bg-brand-900/30'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                  <Bookmark className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Saved Messages</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Notes to self, files & reminders</p>
                </div>
              </button>
            </div>

            <div className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Recent Chats
            </div>

            {/* Conversations list */}
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <>
                {(() => {
                  const activeChats = conversations.filter(c => !c.is_self_chat && !(c.archived_by ?? []).includes(user?.id ?? ''));
                  const archivedChats = conversations.filter(c => !c.is_self_chat && (c.archived_by ?? []).includes(user?.id ?? ''));

                  if (activeChats.length === 0 && archivedChats.length === 0) {
                    return (
                      <div className="text-center py-12 px-4">
                        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <MessageCircle className="w-7 h-7 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">No conversations yet</p>
                        <p className="text-xs text-slate-400 mt-1">Search for someone to start chatting</p>
                      </div>
                    );
                  }

                  const renderConvItem = (conv: ConversationWithDetails) => {
                    const otherUser = conv.other_user;
                    const name = otherUser ? getDisplayName(otherUser.display_name, '') : 'Unknown';
                    const isActive = activeConversationId === conv.id;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                          isActive
                            ? 'bg-brand-50 dark:bg-brand-900/30'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Avatar
                          src={otherUser?.avatar_url}
                          name={name}
                          online={otherUser?.online}
                          showStatus
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {name}
                            </p>
                            {conv.last_message && (
                              <span className="text-xs text-slate-400 shrink-0">
                                {formatTime(conv.last_message.created_at)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {renderLastMessagePreview(conv)}
                            </p>
                            {otherUser && !otherUser.online && otherUser.last_seen && (
                              <span className="text-xs text-slate-400 shrink-0">
                                {formatLastSeen(otherUser.last_seen)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  };

                  return (
                    <>
                      <div className="p-2 space-y-0.5">
                        {activeChats.map(renderConvItem)}
                      </div>
                      {archivedChats.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowArchived(!showArchived)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide hover:text-slate-500 transition-colors"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            Archived ({archivedChats.length})
                          </button>
                          {showArchived && (
                            <div className="p-2 space-y-0.5">
                              {archivedChats.map(renderConvItem)}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer - current user */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 p-2">
          <Avatar src={profile?.avatar_url} name={displayName} size="md" showStatus online />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{displayName}</p>
            <p className="text-xs text-green-500">Online</p>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
