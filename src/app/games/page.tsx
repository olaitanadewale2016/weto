import React, { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TicTacToeArena } from '@/components/games/tictactoe/TicTacToeArena';
import { FeedAdCard } from '@/components/ads/FeedAdCard';

export const metadata = {
  title: 'Tic-Tac-Toe Arena · Games',
  description: 'Play Tic-Tac-Toe solo against Dora the Clever Fox or online with other players.',
};

export default function GamesPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div
            className="min-h-[80vh] flex items-center justify-center text-white font-bold"
            style={{ background: 'linear-gradient(180deg, #262C30 0%, #161719 100%)' }}
          >
            Loading Tic-Tac-Toe Arena...
          </div>
        }
      >
        <TicTacToeArena />
      </Suspense>
      <FeedAdCard slotIndex={701} />
    </AppShell>
  );
}
