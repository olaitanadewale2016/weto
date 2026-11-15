'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Radio, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';

export default function LiveStreamPage() {
  return (
    <AppShell>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 bg-bg-pr/95 backdrop-blur-xs border-b border-bord-tr px-4 py-3.5 flex items-center gap-3">
        <Link
          href="/"
          className="h-8 w-8 rounded-full hover:bg-fill-tr flex items-center justify-center text-lab-pr shrink-0"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-title-3 font-bold text-lab-pr">Live Streaming</h1>
      </div>

      <div className="p-4 sm:p-6">
        <div className="block border border-bord-pr rounded-2xl overflow-hidden bg-bg-pr">
          <div className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="w-full rounded-xl object-cover"
              src="/assets/images/development-state.png"
              alt="Live streaming coming soon"
            />
          </div>
          <div className="h-3 bg-fill-tr opacity-60" />
          <div className="p-5 space-y-3">
            <div className="inline-flex items-center gap-2 text-lab-pr2 font-semibold text-par-s">
              <Radio className="h-4 w-4 text-red-900" /> Live Channels
            </div>
            <h2 className="text-title-3 font-bold text-lab-pr2">This feature is coming soon!</h2>
            <p className="text-lab-pr3 text-par-m">
              Real-time broadcast channels are on the way. Meanwhile, publish instant video stories or publications to
              your feed.
            </p>
            <div className="flex flex-wrap gap-3 pt-3">
              <Link href="/">
                <Button variant="primary">Homepage</Button>
              </Link>
              <Link href="/new/story">
                <Button variant="outline">
                  <Video className="h-4 w-4" /> Share Video Story
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
