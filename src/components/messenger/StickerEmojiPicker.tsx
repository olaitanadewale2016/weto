'use client';

import React, { useState } from 'react';
import { Smile, Sticker, X } from 'lucide-react';
import { EMOJI_GROUPS, STICKER_PACKS } from '@/lib/stickers';
import { cn } from '@/lib/utils';

interface StickerEmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker: (stickerUrl: string) => void;
  onClose: () => void;
}

/**
 * Combined Emoji + Sticker Pack drawer ported from Grupo Pro
 * (`layouts/chat_page/chatbox.php` emojis_module & stickers_module).
 */
export function StickerEmojiPicker({
  onSelectEmoji,
  onSelectSticker,
  onClose,
}: StickerEmojiPickerProps) {
  const [mode, setMode] = useState<'emojis' | 'stickers'>('emojis');
  const [activePackId, setActivePackId] = useState<string>(STICKER_PACKS[0].id);

  const activePack = STICKER_PACKS.find((p) => p.id === activePackId) || STICKER_PACKS[0];

  return (
    <div className="rounded-2xl border border-bord-pr bg-bg-pr shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-bord-pr bg-fill-fv/50">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('emojis')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-cap-l font-semibold transition-colors cursor-pointer',
              mode === 'emojis' ? 'bg-brand-900 text-white' : 'text-lab-sc hover:text-lab-pr hover:bg-fill-sc'
            )}
          >
            <Smile className="size-3.5" /> Emojis
          </button>
          <button
            type="button"
            onClick={() => setMode('stickers')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-cap-l font-semibold transition-colors cursor-pointer',
              mode === 'stickers' ? 'bg-brand-900 text-white' : 'text-lab-sc hover:text-lab-pr hover:bg-fill-sc'
            )}
          >
            <Sticker className="size-3.5" /> Stickers
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-sc cursor-pointer"
          aria-label="Close emoji and sticker picker"
        >
          <X className="size-4" />
        </button>
      </div>

      {mode === 'emojis' ? (
        <div className="max-h-56 overflow-y-auto p-3 space-y-3">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-lab-sc">
                {group.label}
              </p>
              <div className="grid grid-cols-8 sm:grid-cols-12 gap-1">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onSelectEmoji(emoji)}
                    className="h-8 rounded-lg hover:bg-fill-qt flex items-center justify-center text-lg cursor-pointer transition-transform active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-bord-card bg-fill-qt/50 overflow-x-auto">
            {STICKER_PACKS.map((pack) => {
              const active = pack.id === activePack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setActivePackId(pack.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-cap-s font-semibold shrink-0 border transition-colors cursor-pointer',
                    active
                      ? 'border-brand-900 bg-brand-900/10 text-brand-900'
                      : 'border-transparent text-lab-sc hover:bg-fill-sc'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pack.iconUrl} alt={pack.name} className="size-4 object-contain" />
                  <span>{pack.name}</span>
                </button>
              );
            })}
          </div>
          <div className="max-h-52 overflow-y-auto p-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
            {activePack.stickers.map((stickerUrl) => (
              <button
                key={stickerUrl}
                type="button"
                onClick={() => onSelectSticker(stickerUrl)}
                className="aspect-square rounded-xl p-1.5 hover:bg-fill-qt border border-transparent hover:border-bord-card transition-all cursor-pointer flex items-center justify-center active:scale-95"
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
    </div>
  );
}
