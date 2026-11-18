import React, { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TicTacToeArena } from '@/components/games/tictactoe/TicTacToeArena';

export const metadata = {
  title: 'Tic-Tac-Toe Arena · Games',
  description: 'Play Tic-Tac-Toe solo against Dora the Clever Fox or online with other players.',
};

export default function GamesPage() {
  return (
    <AppShell fullWidth hideDesktopSidebar hideMobileChrome hideMobileHeader viewportLocked>
      <Suspense
        fallback={
          <div
            className="h-full w-full flex items-center justify-center text-white font-bold"
            style={{ background: 'linear-gradient(180deg, #262C30 0%, #161719 100%)' }}
          >
            Loading Tic-Tac-Toe Arena...
          </div>
        }
      >
        <TicTacToeArena />
      </Suspense>
    </AppShell>
  );
}
