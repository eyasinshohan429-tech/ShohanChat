import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { playMessageSound } from '@/lib/sound';
import type { Message, Profile, MessageReaction, Conversation } from '@/types';
import { getDisplayName, formatLastSeen, groupMessagesByDate } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import MessageBubble from '@/components/MessageBubble';
import ChatInput from '@/components/ChatInput';
import { Bookmark, Phone, Video, ArrowLeft, Loader2, User as UserIcon, MoreVertical, Trash2, Ban, ShieldX, Palette, UserCog, Tag, X, Pin, Archive, ArchiveRestore } from 'lucide-react';

interface ChatWindowProps {
  conversationId: string;
  otherUser: Profile | null;
  isSelfChat: boolean;
  onBack: () => void;
  onStartCall: (type: 'audio' | 'video') => void;
  onConversationDeleted: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const CHAT_THEMES = [
  { id: 'default', name: 'Forest', color: '#10b981' },
  { id: 'ocean', name: 'Ocean', color: '#0ea5e9' },
  { id: 'mint', name: 'Mint', color: '#34d399' },
  { id: 'warm', name: 'Amber', color: '#f59e0b' },
  { id: 'rose', name: 'Rose', color: '#f43f5e' },
  { id: 'lavender', name: 'Lavender', color: '#8b5cf6' },
];

export default function ChatWindow({ conversationId, otherUser, isSelfChat, onBack, onStartCall, onConversationDeleted }: ChatWindowProps) {
  const { user, isAdmin, deleteUserAsAdmin } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showAdminDelete, setShowAdminDelete] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);
  const [adminDeleteError, setAdminDeleteError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [chatTheme, setChatTheme] = useState('default');
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [showNicknameEditor, setShowNicknameEditor] = useState(false);
  const [contactNickname, setContactNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [showDeleteMsgConfirm, setShowDeleteMsgConfirm] = useState(false);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      setLoading(false);
      return;
    }
    const allMsgs = (data as Message[]) ?? [];
    const visibleMsgs = user
      ? allMsgs.filter((m) => !m.deleted_for?.includes(user.id))
      : allMsgs;
    setMessages(visibleMsgs);
    setLoading(false);
  }, [conversationId]);

  const loadReactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messages.map((m) => m.id));

    if (error || !data) return;

    const map: Record<string, MessageReaction[]> = {};
    for (const r of data as MessageReaction[]) {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push(r);
    }
    setReactions(map);
  }, [messages]);

  const checkBlocked = useCallback(async () => {
    if (!user || !otherUser || isSelfChat) return;
    const { data } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('blocker_id', user.id)
      .eq('blocked_id', otherUser.id)
      .maybeSingle();
    setIsBlocked(!!data);
  }, [user, otherUser, isSelfChat]);

  const loadChatTheme = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('chat_theme')
      .eq('id', conversationId)
      .maybeSingle();
    if (data?.chat_theme) setChatTheme(data.chat_theme);
  }, [conversationId]);

  const loadContactNickname = useCallback(async () => {
    if (!user || !otherUser || isSelfChat) return;
    const { data } = await supabase
      .from('contact_nicknames')
      .select('nickname')
      .eq('owner_id', user.id)
      .eq('target_id', otherUser.id)
      .maybeSingle();
    setContactNickname(data?.nickname ?? '');
  }, [user, otherUser, isSelfChat]);

  const checkArchived = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('archived_by')
      .eq('id', conversationId)
      .maybeSingle();
    setIsArchived((data?.archived_by ?? []).includes(user.id));
  }, [conversationId, user]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
    checkBlocked();
    loadChatTheme();
    loadContactNickname();
    checkArchived();
  }, [conversationId, loadMessages, checkBlocked, loadChatTheme, loadContactNickname, checkArchived]);

  useEffect(() => {
    if (messages.length > 0) loadReactions();
  }, [messages, loadReactions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          if (newMsg.sender_id !== user?.id && !newMsg.read_at) {
            playMessageSound();
            supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', newMsg.id)
              .then(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => loadReactions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, loadReactions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (
    content: string | null,
    messageType: 'text' | 'image' | 'file' | 'audio' | 'sticker' | 'gif',
    fileUrl?: string | null,
    fileName?: string | null,
    fileSize?: number | null
  ) => {
    if (!user) return;
    setSending(true);

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content,
      message_type: messageType,
      file_url: fileUrl ?? null,
      file_name: fileName ?? null,
      file_size: fileSize ?? null,
    });

    if (error) {
      console.error('Send error:', error);
    }

    if (otherUser && !isSelfChat) {
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', otherUser.id);
    }

    setSending(false);
  };

  const handlePinMessage = async (messageId: string, isCurrentlyPinned: boolean) => {
    if (!user) return;
    if (isCurrentlyPinned) {
      await supabase
        .from('messages')
        .update({ is_pinned: false, pinned_by: null })
        .eq('id', messageId);
    } else {
      await supabase
        .from('messages')
        .update({ is_pinned: true, pinned_by: user.id })
        .eq('id', messageId);
    }
    loadMessages();
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('messages')
      .select('deleted_for')
      .eq('id', messageId)
      .maybeSingle();
    const currentDeletedFor: string[] = data?.deleted_for ?? [];
    if (!currentDeletedFor.includes(user.id)) {
      currentDeletedFor.push(user.id);
    }
    await supabase
      .from('messages')
      .update({ deleted_for: currentDeletedFor })
      .eq('id', messageId);
    loadMessages();
  };

  const handleDeleteMessageConfirm = (messageId: string) => {
    setDeleteMsgTarget(messageId);
    setShowDeleteMsgConfirm(true);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    setReactionPickerFor(null);

    const existing = reactions[messageId]?.find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );

    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });
    }
    loadReactions();
  };

  const handleDeleteConversation = async () => {
    const { error } = await supabase.rpc('delete_conversation', { conv_id: conversationId });
    if (!error) {
      onConversationDeleted();
    }
    setShowDeleteConfirm(false);
  };

  const handleArchiveToggle = async () => {
    if (!user) return;
    setShowMenu(false);
    const { data } = await supabase
      .from('conversations')
      .select('archived_by')
      .eq('id', conversationId)
      .maybeSingle();
    const currentArchived: string[] = data?.archived_by ?? [];
    let updated: string[];
    if (currentArchived.includes(user.id)) {
      updated = currentArchived.filter((id) => id !== user.id);
      setIsArchived(false);
    } else {
      updated = [...currentArchived, user.id];
      setIsArchived(true);
    }
    await supabase
      .from('conversations')
      .update({ archived_by: updated })
      .eq('id', conversationId);
  };

  const handleBlockUser = async () => {
    if (!user || !otherUser) return;
    if (isBlocked) {
      await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', otherUser.id);
      setIsBlocked(false);
    } else {
      await supabase
        .from('blocked_users')
        .insert({ blocker_id: user.id, blocked_id: otherUser.id });
      setIsBlocked(true);
    }
    setShowMenu(false);
  };

  const handleThemeChange = async (themeId: string) => {
    setChatTheme(themeId);
    setShowThemePicker(false);
    await supabase
      .from('conversations')
      .update({ chat_theme: themeId })
      .eq('id', conversationId);
  };

  const handleSaveContactNickname = async () => {
    if (!user || !otherUser) return;
    setSavingNickname(true);
    const trimmed = contactNickname.trim();
    if (trimmed) {
      await supabase
        .from('contact_nicknames')
        .upsert({ owner_id: user.id, target_id: otherUser.id, nickname: trimmed }, { onConflict: 'owner_id,target_id' });
    } else {
      await supabase
        .from('contact_nicknames')
        .delete()
        .eq('owner_id', user.id)
        .eq('target_id', otherUser.id);
    }
    setSavingNickname(false);
    setShowNicknameEditor(false);
  };

  const handleAdminDeleteUser = async () => {
    if (!otherUser) return;
    setAdminDeleting(true);
    setAdminDeleteError(null);
    const { error } = await deleteUserAsAdmin(otherUser.id);
    if (error) {
      setAdminDeleteError(error);
      setAdminDeleting(false);
    } else {
      setShowAdminDelete(false);
      onConversationDeleted();
    }
  };

  const displayName = otherUser
    ? getDisplayName(otherUser.display_name, '')
    : 'Unknown';
  const headerName = isSelfChat ? 'Saved Messages' : (contactNickname || displayName);
  const nickname = contactNickname || otherUser?.nickname || '';
  const themeClass = `chat-theme-${chatTheme}`;

  const groupedMessages = groupMessagesByDate(messages);
  const pinnedMessages = messages.filter((m) => m.is_pinned && m.pinned_by === user?.id);

  return (
    <div className={`flex flex-col h-full chat-bg-light dark:chat-bg-dark ${themeClass}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors md:hidden"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {isSelfChat ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
            <Bookmark className="w-5 h-5 text-white" />
          </div>
        ) : (
          <Avatar src={otherUser?.avatar_url} name={displayName} online={otherUser?.online} showStatus />
        )}

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
            {headerName}
            {otherUser?.is_admin && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                <UserCog className="w-2.5 h-2.5" />
                ADMIN
              </span>
            )}
          </h2>
          {!isSelfChat && otherUser && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isBlocked
                ? 'Blocked'
                : otherUser.online
                ? nickname ? `${nickname} · Online` : 'Online'
                : otherUser.last_seen
                ? `last seen ${formatLastSeen(otherUser.last_seen)}`
                : 'offline'}
            </p>
          )}
          {isSelfChat && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Notes to self</p>
          )}
        </div>

        {!isSelfChat && otherUser && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onStartCall('audio')}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              title="Voice call"
            >
              <Phone className="w-5 h-5" />
            </button>
            <button
              onClick={() => onStartCall('video')}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              title="Video call"
            >
              <Video className="w-5 h-5" />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
                title="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-20 animate-fade-in">
                  <button
                    onClick={() => { setShowMenu(false); setShowThemePicker(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <Palette className="w-4 h-4 text-brand-500" />
                    Chat theme
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); setShowNicknameEditor(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <Tag className="w-4 h-4 text-brand-500" />
                    Set nickname
                  </button>
                  <button
                    onClick={handleArchiveToggle}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="w-4 h-4 text-brand-500" />
                        Unarchive chat
                      </>
                    ) : (
                      <>
                        <Archive className="w-4 h-4 text-brand-500" />
                        Archive chat
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleBlockUser}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {isBlocked ? (
                      <>
                        <ShieldX className="w-4 h-4 text-green-500" />
                        Unblock user
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4 text-red-500" />
                        Block user
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete chat
                  </button>
                  {isAdmin && !otherUser.is_admin && (
                    <button
                      onClick={() => { setShowMenu(false); setShowAdminDelete(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-slate-700 mt-1 pt-2"
                    >
                      <UserCog className="w-4 h-4" />
                      Delete user (Admin)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isSelfChat && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              title="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-20 animate-fade-in">
                <button
                  onClick={() => { setShowMenu(false); setShowThemePicker(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <Palette className="w-4 h-4 text-brand-500" />
                  Chat theme
                </button>
                <button
                  onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete chat
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pinned messages bar — shows at top of messages area */}
      {pinnedMessages.length > 0 && (
        <div className="shrink-0 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
          <div className="flex items-center gap-2">
            <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
              <div className="flex gap-2">
                {pinnedMessages.map((pm) => (
                  <div
                    key={pm.id}
                    className="shrink-0 max-w-[200px] bg-white dark:bg-slate-800 rounded-lg px-3 py-1.5 border border-amber-200 dark:border-amber-800"
                  >
                    <p className="text-xs text-slate-700 dark:text-slate-300 truncate">
                      {pm.message_type === 'sticker' ? pm.content : pm.message_type === 'gif' ? 'GIF' : pm.message_type === 'image' ? 'Photo' : pm.message_type === 'audio' ? 'Voice message' : pm.content ?? ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                pinnedMessages.forEach((pm) => handlePinMessage(pm.id, true));
              }}
              className="shrink-0 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
            >
              Unpin all
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            {isSelfChat ? (
              <>
                <div className="w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <Bookmark className="w-8 h-8 text-white" />
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Saved Messages</p>
                <p className="text-xs mt-1">Save notes, files, and reminders here</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mb-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <UserIcon className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No messages yet</p>
                <p className="text-xs mt-1">Send a message to start the conversation</p>
              </>
            )}
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date} className="space-y-1">
              <div className="flex justify-center my-3">
                <span className="px-3 py-1 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-full text-xs font-medium text-slate-500 dark:text-slate-400 shadow-sm">
                  {group.date}
                </span>
              </div>
              {group.items.map((msg, idx) => {
                const isOwn = msg.sender_id === user?.id;
                const prevMsg = group.items[idx - 1];
                const showAvatar = !isOwn && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
                const msgReactions = reactions[msg.id] ?? [];
                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={isOwn}
                    showAvatar={showAvatar}
                    senderName={displayName}
                    senderAvatar={otherUser?.avatar_url}
                    reactions={msgReactions}
                    currentUserId={user?.id ?? ''}
                    isPinned={msg.is_pinned && msg.pinned_by === user?.id}
                    onReaction={(emoji) => handleReaction(msg.id, emoji)}
                    onReactionPickerToggle={() =>
                      setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)
                    }
                    showReactionPicker={reactionPickerFor === msg.id}
                    onPin={() => handlePinMessage(msg.id, msg.is_pinned && msg.pinned_by === user?.id)}
                    onDelete={() => handleDeleteMessageConfirm(msg.id)}
                  />
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isBlocked ? (
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You blocked this user. Unblock them to send messages.
          </p>
          <button
            onClick={handleBlockUser}
            className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"
          >
            Unblock
          </button>
        </div>
      ) : (
        <ChatInput 
          conversationId={conversationId} 
          onSend={handleSend} 
          disabled={sending}
        />
      )}

      {/* Message delete confirmation */}
      {showDeleteMsgConfirm && deleteMsgTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete message?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                This message will be deleted for you. The other person will still be able to see it.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setShowDeleteMsgConfirm(false); setDeleteMsgTarget(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteMsgTarget) handleDeleteMessage(deleteMsgTarget);
                    setShowDeleteMsgConfirm(false);
                    setDeleteMsgTarget(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete conversation confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete chat?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                All messages, photos, and files in this conversation will be permanently deleted for you.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConversation}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme picker */}
      {showThemePicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-brand-500" />
                Chat Theme
              </h2>
              <button
                onClick={() => setShowThemePicker(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {CHAT_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                    chatTheme === theme.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div
                    className="w-12 h-12 rounded-full shadow-md"
                    style={{ background: `linear-gradient(135deg, ${theme.color}, ${theme.color}99)` }}
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Nickname editor */}
      {showNicknameEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-brand-500" />
                Set Nickname
              </h2>
              <button
                onClick={() => setShowNicknameEditor(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Set a custom nickname for {displayName}. Only you can see it.
            </p>
            <input
              type="text"
              value={contactNickname}
              onChange={(e) => setContactNickname(e.target.value)}
              placeholder="Enter a nickname..."
              maxLength={30}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all mb-4"
            />
            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setShowNicknameEditor(false); setContactNickname(''); }}
                disabled={savingNickname}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveContactNickname}
                disabled={savingNickname}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingNickname ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin delete user confirmation */}
      {showAdminDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <UserCog className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete user?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                This will permanently delete <span className="font-semibold text-slate-700 dark:text-slate-300">{displayName}</span> and all their data. This action cannot be undone.
              </p>
              {adminDeleteError && (
                <p className="text-sm text-red-500 mb-4 w-full text-left">{adminDeleteError}</p>
              )}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setShowAdminDelete(false); setAdminDeleteError(null); }}
                  disabled={adminDeleting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminDeleteUser}
                  disabled={adminDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {adminDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete user'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { QUICK_EMOJIS };
