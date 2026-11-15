'use client';

import React from 'react';
import { Pause, Play, Volume2, X } from 'lucide-react';
import { useApp } from '@/components/providers/AppContext';

export function Soundbar() {
  const { soundbarTrack, isAudioPlaying, togglePlayAudio, closeSoundbar } = useApp();
  if (!soundbarTrack) return null;

  return (
    <div className="fixed bottom-[calc(4rem+max(1rem,env(safe-area-inset-bottom)))] md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem-env(safe-area-inset-left)-env(safe-area-inset-right))] max-w-md rounded-full border border-bord-pr bg-bg-pr/95 backdrop-blur-md shadow-vertical-tr px-4 py-2.5 flex items-center gap-3">
      <button
        type="button"
        onClick={togglePlayAudio}
        className="h-9 w-9 rounded-full bg-brand-900 text-white flex items-center justify-center shrink-0 cursor-pointer"
        aria-label={isAudioPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isAudioPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-par-n font-semibold text-lab-pr truncate">{soundbarTrack.title}</p>
        <p className="text-cap-s text-lab-sc truncate flex items-center gap-1">
          <Volume2 className="h-3 w-3" /> {soundbarTrack.artist || 'Audio attachment'}
        </p>
      </div>
      <button
        type="button"
        onClick={closeSoundbar}
        className="p-1.5 rounded-full text-lab-sc hover:bg-fill-sc hover:text-lab-pr cursor-pointer"
        aria-label="Close audio player"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
