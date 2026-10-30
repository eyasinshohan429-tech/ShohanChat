import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { EmojiPickerButton } from '@/components/EmojiPicker';
import { StickerGifButton } from '@/components/StickerGifPanel';
import { Paperclip, Mic, Send, Image as ImageIcon, X, Loader2, Trash2, ThumbsUp } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

interface ChatInputProps {
  conversationId: string;
  onSend: (content: string | null, messageType: 'text' | 'image' | 'file' | 'audio' | 'sticker' | 'gif', fileUrl?: string | null, fileName?: string | null, fileSize?: number | null) => Promise<void>;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSendText = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    await onSend(text.trim(), 'text');
    setText('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleSendSticker = async (sticker: string) => {
    if (sending) return;
    setSending(true);
    await onSend(sticker, 'sticker');
    setSending(false);
  };

  const handleSendGif = async (gifUrl: string) => {
    if (sending) return;
    setSending(true);
    await onSend(null, 'gif', gifUrl, 'GIF', null);
    setSending(false);
  };

  const uploadFile = async (file: File, bucket: string): Promise<{ url: string; path: string } | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop() ?? 'bin';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: false });
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return { url: urlData.publicUrl, path: fileName };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, isImage: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttach(false);
    setUploading(true);
    setSending(true);

    const result = await uploadFile(file, 'chat-media');
    if (result) {
      await onSend(
        file.name,
        isImage ? 'image' : 'file',
        result.url,
        file.name,
        file.size
      );
    }

    setUploading(false);
    setSending(false);
    if (e.target) e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setUploading(true);
        setSending(true);
        const result = await uploadFile(file, 'chat-media');
        if (result) {
          await onSend(null, 'audio', result.url, file.name, file.size);
        }
        setUploading(false);
        setSending(false);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error('Recording error:', err);
    }
  };

  const stopRecording = (cancel: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (cancel) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = () => {
          streamRef.current?.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        };
        mediaRecorderRef.current.stop();
      } else {
        mediaRecorderRef.current.stop();
      }
    }
    setRecording(false);
    setRecordTime(0);
  };

  return (
    <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
      {/* Attachment menu */}
      {showAttach && (
        <div className="mb-2 flex gap-2 animate-slide-up">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
          >
            <ImageIcon className="w-4 h-4 text-green-500" />
            Photo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
          >
            <Paperclip className="w-4 h-4 text-brand-500" />
            Document
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
          <div className="relative">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping" />
          </div>
          <span className="text-sm font-medium text-red-600 dark:text-red-400">Recording...</span>
          <span className="text-sm text-red-500 tabular-nums">{formatDuration(recordTime)}</span>
          <button
            onClick={() => stopRecording(true)}
            className="ml-auto p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-800/30 text-red-500 transition-colors"
            title="Cancel"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => stopRecording(false)}
            className="p-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
            title="Send voice note"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      ) : uploading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Uploading...</span>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          {/* Emoji picker — left side */}
          <EmojiPickerButton onEmojiSelect={(emoji) => setText((t) => t + emoji)} />

          {/* Sticker / GIF button — left side */}
          <StickerGifButton onGifSelect={handleSendGif} onStickerSelect={handleSendSticker} />

          {/* Voice record button — left side */}
          <button
            onClick={startRecording}
            disabled={!!text.trim()}
            className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-40 shrink-0"
            title="Record voice note"
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Attach button — left side */}
          <button
            onClick={() => setShowAttach(!showAttach)}
            className={`p-2 rounded-full transition-colors shrink-0 ${
              showAttach
                ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
            title="Attach"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all scrollbar-thin"
            style={{ maxHeight: '120px' }}
          />

          {/* Quick like (thumbs-up) — right side, sends a like emoji */}
          {!text.trim() && (
            <button
              onClick={() => handleSendSticker('👍')}
              disabled={sending}
              className="p-2.5 rounded-full hover:bg-brand-100 dark:hover:bg-brand-900/40 text-brand-500 hover:text-brand-600 transition-all shrink-0 disabled:opacity-50 hover:scale-110"
              title="Send like"
            >
              <ThumbsUp className="w-5 h-5" />
            </button>
          )}

          {/* Send button — right side */}
          {text.trim() ? (
            <button
              onClick={handleSendText}
              disabled={sending}
              className="p-2.5 bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white rounded-full shadow-lg shadow-brand-500/30 transition-all disabled:opacity-50 shrink-0"
              title="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : null}

          {showAttach && (
            <button
              onClick={() => setShowAttach(false)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, true)}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileSelect(e, false)}
      />
    </div>
  );
}
