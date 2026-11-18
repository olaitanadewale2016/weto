'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PostComposer } from '@/components/feed/PostComposer';
import { useApp } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';

export default function NewPostPage() {
  const router = useRouter();
  const { user } = useApp();

  return (
    <div className="fixed inset-0 z-[60] bg-bg-pr text-lab-pr flex flex-col overflow-x-hidden max-w-full">
      {/* Top Toolbar matching Source/resources/js/spa/apps/mobile/views/editors/post/PostEditor.vue */}
      <header className="shrink-0 pt-safe px-safe border-b border-bord-tr bg-bg-pr">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0 cursor-pointer"
              aria-label="Close editor"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-title-3 font-bold text-lab-pr truncate">New publication</h1>
          </div>
          <div className="w-8" />
        </div>
      </header>

      <div className="h-2 bg-bord-pr opacity-60 shrink-0" />

      {!user ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 pb-safe text-center space-y-4">
          <p className="text-par-m text-lab-sc">Sign in to publish updates, photos, videos, or polls.</p>
          <Link href="/auth/login">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col max-w-2xl w-full mx-auto min-w-0">
          <PostComposer
            fullScreen
            placeholder="What's new?"
            onCreated={() => {
              router.push('/');
            }}
          />
        </div>
      )}
    </div>
  );
}
