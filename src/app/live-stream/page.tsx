'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Radio, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';

export default function LiveStreamPage() {
  return (
    <AppShell hideMobileHeader>
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center gap-2">
          <Link
            href="/"
            className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-title-3 font-bold text-lab-pr truncate">Live Streaming</h1>
        </div>
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
