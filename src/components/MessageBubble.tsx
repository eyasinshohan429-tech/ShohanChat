import { useState, useRef, useEffect } from 'react';
import type { Message, MessageReaction } from '@/types';
import { formatTime, formatFileSize } from '@/lib/utils';
import { FileText, Download, Play, Pause, SmilePlus, Pin, Trash2, X } from 'lucide-react';
import { QUICK_EMOJIS } from '@/components/ChatWindow';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  senderName: string;
  senderAvatar?: string | null;
  reactions: MessageReaction[];
  currentUserId: string;
  isPinned: boolean;
  onReaction: (emoji: string) => void;
  onReactionPickerToggle: () => void;
  showReactionPicker: boolean;
  onPin: () => void;
  onDelete: () => void;
}

export default function MessageBubble({
  message,
  isOwn,
  showAvatar,
  senderName,
  senderAvatar,
  reactions,
  currentUserId,
  isPinned,
  onReaction,
  onReactionPickerToggle,
  showReactionPicker,
  onPin,
  onDelete,
}: MessageBubbleProps) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showActionMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionMenu]);

  const toggleAudio = () => {
    if (!audioRef.current && message.file_url) {
      const audio = new Audio(message.file_url);
      audioRef.current = audio;
      audio.onended = () => setAudioPlaying(false);
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
    } else {
      audio.play();
      setAudioPlaying(true);
    }
  };

  const groupedReactions = reactions.reduce<Record<string, { count: number; hasMine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasMine: false };
    acc[r.emoji].count++;
    if (r.user_id === currentUserId) acc[r.emoji].hasMine = true;
    return acc;
  }, {});

  const renderContent = () => {
    switch (message.message_type) {
      case 'image':
        return (
          <div className="relative">
            <img
              src={message.file_url ?? ''}
              alt={message.file_name ?? 'Shared image'}
              className="rounded-xl max-w-full max-h-72 object-cover cursor-pointer"
              onClick={() => window.open(message.file_url ?? '', '_blank')}
            />
            <span className="block text-xs mt-1 opacity-70">{formatTime(message.created_at)}</span>
          </div>
        );
      case 'gif':
        return (
          <div className="relative">
            <img
              src={message.file_url ?? ''}
              alt="GIF"
              className="rounded-xl max-w-full max-h-60 object-cover"
              onClick={() => window.open(message.file_url ?? '', '_blank')}
            />
            <span className="block text-xs mt-1 opacity-70">{formatTime(message.created_at)}</span>
          </div>
        );
      case 'sticker':
        return (
          <div className="relative">
            <div className="text-6xl text-center py-1">{message.content}</div>
            <span className="block text-xs mt-1 opacity-70 text-center">{formatTime(message.created_at)}</span>
          </div>
        );
      case 'file':
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              isOwn ? 'bg-white/20' : 'bg-brand-100 dark:bg-brand-900/40'
            }`}>
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.file_name ?? 'File'}</p>
              <p className="text-xs opacity-70">
                {message.file_size ? formatFileSize(message.file_size) : ''}
              </p>
            </div>
            <a
              href={message.file_url ?? '#'}
              download={message.file_name ?? ''}
              className={`p-2 rounded-lg transition-colors ${
                isOwn ? 'hover:bg-white/20' : 'hover:bg-brand-100 dark:hover:bg-brand-900/40'
              }`}
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        );
      case 'audio':
        return (
          <div className="flex items-center gap-3 min-w-[180px]">
            <button
              onClick={toggleAudio}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-brand-500 text-white hover:bg-brand-600'
              }`}
            >
              {audioPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-1 h-8">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-0.5 rounded-full ${
                      isOwn ? 'bg-white/40' : 'bg-brand-300 dark:bg-brand-700'
                    }`}
                    style={{ height: `${Math.random() * 100}%` }}
                  />
                ))}
              </div>
              <span className="text-xs opacity-70 mt-0.5 block">{formatTime(message.created_at)}</span>
            </div>
          </div>
        );
      default:
        return (
          <>
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <span className="text-xs opacity-60">{formatTime(message.created_at)}</span>
              {isOwn && message.read_at && (
                <span className="text-xs opacity-60">· Read</span>
              )}
            </div>
          </>
        );
    }
  };

  const isSticker = message.message_type === 'sticker';
  const isStickerOrGif = isSticker || message.message_type === 'gif';

  return (
    <div className={`flex gap-2.5 ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in group`}>
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-xs text-white font-medium">
              {senderName[0]?.toUpperCase()}
            </div>
          )}
        </div>
      )}
      <div className={`relative max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Pinned indicator */}
        {isPinned && (
          <div className={`flex items-center gap-1 mb-1 text-xs text-slate-400 dark:text-slate-500 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <Pin className="w-3 h-3" />
            <span>Pinned</span>
          </div>
        )}

        <div className="flex items-center gap-0">
          {/* Action bar — appears on hover, positioned outside the bubble on the right for own, left for others */}
          <div
            className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? 'order-first mr-1' : 'order-last ml-1'}`}
          >
            <button
              onClick={onReactionPickerToggle}
              className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 shadow-md flex items-center justify-center hover:scale-110 transition-transform"
              title="React"
            >
              <SmilePlus className="w-4 h-4 text-slate-500 dark:text-slate-300" />
            </button>
            <div className="relative" ref={actionMenuRef}>
              <button
                onClick={() => setShowActionMenu(!showActionMenu)}
                className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 shadow-md flex items-center justify-center hover:scale-110 transition-transform"
                title="More"
              >
                <svg className="w-4 h-4 text-slate-500 dark:text-slate-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {showActionMenu && (
                <div className={`absolute top-full mt-1 ${isOwn ? 'right-0' : 'left-0'} w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-30 animate-fade-in`}>
                  <button
                    onClick={() => { onPin(); setShowActionMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <Pin className={`w-4 h-4 ${isPinned ? 'text-brand-500 fill-current' : 'text-slate-400'}`} />
                    {isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={() => { onDelete(); setShowActionMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bubble */}
          <div
            ref={bubbleRef}
            className={isSticker
              ? 'p-0'
              : `px-3.5 py-2 rounded-2xl ${
                  isOwn
                    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-md shadow-sm border border-slate-100 dark:border-slate-700'
                } ${message.message_type === 'gif' ? 'bg-transparent dark:bg-transparent border-0 shadow-none p-0' : ''}`}
          >
            {renderContent()}
          </div>
        </div>

        {/* Quick reaction emoji bar — appears below bubble when toggled */}
        {showReactionPicker && (
          <div className={`absolute z-30 ${isOwn ? 'right-0' : 'left-0'} -top-12 flex items-center gap-0.5 bg-white dark:bg-slate-800 rounded-full shadow-xl border border-slate-200 dark:border-slate-700 px-2 py-1.5 animate-fade-in`}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReaction(emoji)}
                className="text-xl hover:scale-125 transition-transform px-0.5"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={onReactionPickerToggle}
              className="ml-1 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Display reactions */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className={`flex gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {Object.entries(groupedReactions).map(([emoji, { count, hasMine }]) => (
              <button
                key={emoji}
                onClick={() => onReaction(emoji)}
                className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition-all hover:scale-105 ${
                  hasMine
                    ? 'bg-brand-100 dark:bg-brand-900/40 ring-1 ring-brand-300 dark:ring-brand-700'
                    : 'bg-slate-100 dark:bg-slate-700'
                }`}
              >
                <span>{emoji}</span>
                {count > 1 && <span className="text-slate-600 dark:text-slate-300 font-medium">{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
