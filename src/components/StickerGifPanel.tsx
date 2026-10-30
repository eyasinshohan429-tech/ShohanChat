import { useState, useRef, useEffect } from 'react';
import { Sticker, Search, Loader2 } from 'lucide-react';

const TRENDING_GIFS = [
  'https://media.tenor.com/x8v1oNUOmg4AAAAC/rainbow-cat.gif',
  'https://media.tenor.com/I6kNvq8tZ9gAAAAC/thumbs-up-thumbs.gif',
  'https://media.tenor.com/JeMU3X2nm0gAAAAC/love-hearts.gif',
  'https://media.tenor.com/7HbCkAqO0YwAAAAC/happy-dance.gif',
  'https://media.tenor.com/aSvCiRrjDQOAAAAC/cute-otter.gif',
  'https://media.tenor.com/3ZvEeYwq0oUAAAAC/clapping-clap.gif',
  'https://media.tenor.com/k6kqIDGFy6YAAAAC/celebrate-party.gif',
  'https://media.tenor.com/8vanJw8kOtgAAAAC/sad-puppy.gif',
  'https://media.tenor.com/PjJmAQfX858AAAAC/angry-mad.gif',
  'https://media.tenor.com/4HBJgIq0pNwAAAAC/thinking-think.gif',
  'https://media.tenor.com/HWq8GOLrJrYAAAAC/high-five.gif',
  'https://media.tenor.com/4LBh5FCoKgkAAAAC/cute-cat.gif',
  'https://media.giphy.com/media/3o7TKPdAxAwUY4vBQA/giphy.gif',
  'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
  'https://media.giphy.com/media/26gswgZJ2PmFGGUpO/giphy.gif',
  'https://media.giphy.com/media/3og0IFrHkIglEOg8Ba/giphy.gif',
  'https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif',
  'https://media.giphy.com/media/3o7TKEP6YngkCKF8by/giphy.gif',
  'https://media.giphy.com/media/26u4lOMA8JK0L7Tvi/giphy.gif',
  'https://media.giphy.com/media/11sBLV0Ns2JZqI/giphy.gif',
  'https://media.giphy.com/media/3oEjI5VtIhHvK37WYo/giphy.gif',
  'https://media.giphy.com/media/l4KhVNCBHLFktofVO/giphy.gif',
  'https://media.giphy.com/media/3oxRmsLZc6KfpW3lLq/giphy.gif',
  'https://media.giphy.com/media/26FmQ1eUez5mqbwXi/giphy.gif',
  'https://media.giphy.com/media/3o7TKP6ABuAppXL9XK/giphy.gif',
  'https://media.giphy.com/media/l0HlNQpxgXzslYzWU/giphy.gif',
  'https://media.giphy.com/media/5GoKLrl7e3CLq/giphy.gif',
  'https://media.giphy.com/media/14tnGE4EeXTdS/giphy.gif',
  'https://media.giphy.com/media/26gJArEHRjB9LBW36/giphy.gif',
  'https://media.giphy.com/media/3o7TKP9jfXbZ3yJSvO/giphy.gif',
];

const STICKERS = [
  '😀', '😂', '🥰', '😍', '🤩', '😎', '🤗', '🤔',
  '😴', '🤤', '😭', '😡', '🥳', '😱', '🤯', '🥺',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👋',
  '❤️', '🔥', '✨', '🎉', '💯', '⭐', '🌈', '💔',
];

interface StickerGifPanelProps {
  onGifSelect: (url: string) => void;
  onStickerSelect: (sticker: string) => void;
  onClose: () => void;
}

export default function StickerGifPanel({ onGifSelect, onStickerSelect, onClose }: StickerGifPanelProps) {
  const [tab, setTab] = useState<'gif' | 'sticker'>('gif');
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<string[]>(TRENDING_GIFS);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (tab !== 'gif' || !searchQuery.trim()) {
      setGifs(TRENDING_GIFS);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(searchQuery)}&limit=24&rating=pg`
        );
        const data = await res.json();
        if (data?.data) {
          setGifs(data.data.map((g: any) => g.images.fixed_height_small.url));
        }
      } catch {
        setGifs(TRENDING_GIFS);
      }
      setSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, tab]);

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-0 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 animate-slide-up overflow-hidden"
    >
      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-700">
        <button
          onClick={() => setTab('gif')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'gif'
              ? 'bg-brand-500 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          GIFs
        </button>
        <button
          onClick={() => setTab('sticker')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'sticker'
              ? 'bg-brand-500 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Stickers
        </button>
      </div>

      {/* Search (GIF only) */}
      {tab === 'gif' && (
        <div className="p-2 border-b border-slate-100 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GIFs..."
              className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-2 max-h-64 overflow-y-auto scrollbar-thin">
        {tab === 'gif' ? (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((url, i) => (
              <button
                key={i}
                onClick={() => onGifSelect(url)}
                className="relative rounded-xl overflow-hidden hover:opacity-80 transition-opacity aspect-square bg-slate-100 dark:bg-slate-700"
              >
                <img src={url} alt="GIF" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1">
            {STICKERS.map((s, i) => (
              <button
                key={i}
                onClick={() => onStickerSelect(s)}
                className="text-2xl w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StickerGifButton({
  onGifSelect,
  onStickerSelect,
}: {
  onGifSelect: (url: string) => void;
  onStickerSelect: (sticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
        title="Stickers & GIFs"
      >
        <Sticker className="w-5 h-5" />
      </button>
      {open && (
        <StickerGifPanel
          onGifSelect={(url) => {
            onGifSelect(url);
            setOpen(false);
          }}
          onStickerSelect={(s) => {
            onStickerSelect(s);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
