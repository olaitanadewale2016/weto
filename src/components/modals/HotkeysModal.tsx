'use client';

import React from 'react';
import { Modal } from '@/components/ui/modal';

const SHORTCUTS = [
  { key: '?', desc: 'Show keyboard shortcuts' },
  { key: 'G then H', desc: 'Go to Home Feed' },
  { key: 'G then E', desc: 'Go to Explore' },
  { key: 'G then M', desc: 'Go to Messenger' },
  { key: 'G then N', desc: 'Go to Notifications' },
  { key: 'G then B', desc: 'Go to Bookmarks' },
  { key: 'Esc', desc: 'Close active dialog or viewer' },
];

export function HotkeysModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts" description="Navigate Weto faster.">
      <div className="divide-y divide-bord-pr">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between py-2.5">
            <span className="text-par-n text-lab-pr">{s.desc}</span>
            <kbd className="rounded-lg border border-bord-pr bg-fill-sc px-2.5 py-1 text-cap-l font-mono font-semibold text-lab-pr">
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
