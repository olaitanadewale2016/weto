'use client';

import React, { useState } from 'react';
import { Film, Search, Smile, Sticker, X } from 'lucide-react';
import { EMOJI_GROUPS, STICKER_PACKS } from '@/lib/stickers';
import { GiphyPicker } from '@/components/feed/GiphyPicker';
import { cn } from '@/lib/utils';

interface StickerEmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker: (stickerUrl: string) => void;
  onSelectGif?: (gifUrl: string) => void;
  onClose: () => void;
  initialTab?: 'emojis' | 'stickers' | 'gifs';
}

/**
 * Authentic Telegram-style Sticker & Emoji & GIF Pop-up Card
 */
export function StickerEmojiPicker({
  onSelectEmoji,
  onSelectSticker,
  onSelectGif,
  onClose,
  initialTab = 'emojis',
}: StickerEmojiPickerProps) {
  const [mode, setMode] = useState<'emojis' | 'stickers' | 'gifs'>(initialTab);
  const [activePackId, setActivePackId] = useState<string>(STICKER_PACKS[0].id);
  const [emojiSearch, setEmojiSearch] = useState('');

  const activePack = STICKER_PACKS.find((p) => p.id === activePackId) || STICKER_PACKS[0];

  const filteredEmojiGroups = emojiSearch.trim()
    ? EMOJI_GROUPS.map((grp) => ({
        ...grp,
        emojis: grp.emojis.filter((emoji) =>
          grp.label.toLowerCase().includes(emojiSearch.toLowerCase())
        ),
      })).filter((grp) => grp.emojis.length > 0)
    : EMOJI_GROUPS;

  return (
    <div className="flex flex-col h-full w-full bg-bg-pr text-lab-pr select-none">
      {/* Telegram-style Tabs Bar */}
      <div className="flex items-center justify-between px-3 pt-2 border-b border-bord-pr bg-fill-fv/40 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMode('emojis')}
            className={cn(
              'inline-flex items-center gap-1.5 pb-2 text-par-s font-semibold transition-colors cursor-pointer border-b-2',
              mode === 'emojis'
                ? 'border-brand-900 text-brand-900'
                : 'border-transparent text-lab-sc hover:text-lab-pr'
            )}
          >
            <Smile className="size-4" /> Emoji
          </button>
          <button
            type="button"
            onClick={() => setMode('stickers')}
            className={cn(
              'inline-flex items-center gap-1.5 pb-2 text-par-s font-semibold transition-colors cursor-pointer border-b-2',
              mode === 'stickers'
                ? 'border-brand-900 text-brand-900'
                : 'border-transparent text-lab-sc hover:text-lab-pr'
            )}
          >
            <Sticker className="size-4" /> Stickers
          </button>
          {onSelectGif && (
            <button
              type="button"
              onClick={() => setMode('gifs')}
              className={cn(
                'inline-flex items-center gap-1.5 pb-2 text-par-s font-semibold transition-colors cursor-pointer border-b-2',
                mode === 'gifs'
                  ? 'border-brand-900 text-brand-900'
                  : 'border-transparent text-lab-sc hover:text-lab-pr'
              )}
            >
              <Film className="size-4" /> GIFs
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 -mt-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-sc cursor-pointer"
          aria-label="Close picker"
        >
          <X className="size-4" />
        </button>
      </div>

      {mode === 'emojis' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-2 border-b border-bord-pr/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-lab-sc" />
              <input
                type="search"
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
                placeholder="Search emoji..."
                className="w-full h-8 rounded-full bg-fill-qt border-0 pl-8 pr-3 text-cap-l text-lab-pr placeholder:text-lab-sc focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filteredEmojiGroups.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-lab-sc/90">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onSelectEmoji(emoji)}
                      className="size-9 rounded-lg hover:bg-fill-qt flex items-center justify-center text-xl cursor-pointer transition-transform active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'stickers' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Sticker Packs Horizontal Selector with Mouse Wheel rolling */}
          <div
            onWheel={(e) => {
              if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-bord-card bg-fill-qt/50 overflow-x-auto hidden-scroll shrink-0"
          >
            {STICKER_PACKS.map((pack) => {
              const active = pack.id === activePack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setActivePackId(pack.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-cap-s font-semibold shrink-0 border transition-all cursor-pointer',
                    active
                      ? 'border-brand-900 bg-brand-900 text-white shadow-xs'
                      : 'border-transparent text-lab-sc hover:bg-fill-sc hover:text-lab-pr'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pack.iconUrl} alt={pack.name} className="size-4 object-contain" />
                  <span>{pack.name}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-2.5">
            {activePack.stickers.map((stickerUrl) => (
              <button
                key={stickerUrl}
                type="button"
                onClick={() => onSelectSticker(stickerUrl)}
                className="aspect-square rounded-xl p-2 hover:bg-fill-qt border border-transparent hover:border-bord-card transition-all cursor-pointer flex items-center justify-center active:scale-95"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stickerUrl}
                  alt="Sticker"
                  loading="lazy"
                  decoding="async"
                  className="max-h-full max-w-full object-contain"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'gifs' && onSelectGif && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <GiphyPicker
            onSelect={(url) => {
              onSelectGif(url);
            }}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
