'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CirclePlus, Image as ImageIcon, Type, Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { useToast } from '@/components/providers/ToastProvider';

const BG_PALETTES = [
  '#4A5CF9',
  '#0F172A',
  '#7F56D9',
  '#DB2777',
  '#059669',
  '#D97706',
];

export default function NewStoryPage() {
  const router = useRouter();
  const { error, success } = useToast();

  const [type, setType] = useState<'text' | 'image' | 'video'>('image');
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<'all' | 'followers'>('all');
  const [isHighlight, setIsHighlight] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [bgColor, setBgColor] = useState(BG_PALETTES[0]);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|m4v|webm|mov|mkv|3gp)$/i.test(file.name);
    setPreviewUrl(localPreview);
    setType(isVideo ? 'video' : 'image');
    setUploading(true);
    try {
      const res = await uploadFileToR2(file, 'stories', 'story_frame');
      setMediaId(res.mediaId);
      setPreviewUrl(resolveMediaUrl(res.publicUrl) || res.publicUrl);
      setType(res.mediaType === 'video' ? 'video' : 'image');
      success('Story media uploaded');
    } catch (err) {
      setMediaId(null);
      setPreviewUrl(null);
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
      setTimeout(() => URL.revokeObjectURL(localPreview), 2500);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (type !== 'text' && !mediaId) {
      error('Please upload an image or video, or switch to Text Story.');
      return;
    }
    if (type === 'text' && !content.trim()) {
      error('Please enter text for your story.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ storyUuid: string }>('/stories', {
        method: 'POST',
        json: {
          type,
          content: content.trim() || undefined,
          mediaId: mediaId || undefined,
          privacy,
          isHighlight,
          durationSeconds,
          bgColor: type === 'text' ? bgColor : undefined,
        },
      });
      success('Story published!');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weto:story-event'));
      }
      router.push(`/stories/${res.storyUuid}`);
    } catch (err) {
      error('Could not publish story', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="border-b border-bord-pr px-4 py-3 flex items-center gap-3">
        <Link href="/" className="p-1.5 rounded-full hover:bg-fill-sc">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-title-3 font-bold text-lab-pr">Create Story</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={type !== 'text' ? 'primary' : 'outline'}
            onClick={() => setType('image')}
          >
            <ImageIcon className="h-4 w-4" /> Photo / Video
          </Button>
          <Button
            type="button"
            variant={type === 'text' ? 'primary' : 'outline'}
            onClick={() => {
              setType('text');
              setMediaId(null);
              setPreviewUrl(null);
            }}
          >
            <Type className="h-4 w-4" /> Text Story
          </Button>
        </div>

        {type === 'text' ? (
          <div className="space-y-3">
            <div
              className="rounded-3xl min-h-[260px] p-6 flex items-center justify-center text-center text-white text-title-2 font-bold shadow-vertical-qt"
              style={{ backgroundColor: bgColor }}
            >
              {content || 'Your text story preview'}
            </div>
            <div className="flex items-center gap-2">
              {BG_PALETTES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBgColor(color)}
                  className={`h-8 w-8 rounded-full border-2 cursor-pointer ${
                    bgColor === color ? 'border-lab-pr scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        ) : (
          <label className="block rounded-3xl border-2 border-dashed border-bord-pr bg-fill-pr/50 p-6 text-center cursor-pointer hover:bg-fill-pr">
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {previewUrl ? (
              type === 'video' ? (
                <video src={previewUrl} controls className="mx-auto max-h-80 rounded-2xl" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Story preview" className="mx-auto max-h-80 rounded-2xl object-contain" />
              )
            ) : (
              <div className="space-y-2 py-8">
                <Upload className="h-8 w-8 text-lab-pr3 mx-auto" />
                <p className="text-par-n font-semibold text-lab-pr">
                  {uploading ? 'Uploading to Cloudflare R2...' : 'Click to upload photo or video'}
                </p>
                <p className="text-cap-l text-lab-sc">Stories expire automatically after 24 hours.</p>
              </div>
            )}
          </label>
        )}

        <Textarea
          label="Caption / Overlay Text"
          placeholder="Say something or @mention a friend..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Who can view this story?"
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as 'all' | 'followers')}
          >
            <option value="all">Everyone</option>
            <option value="followers">Followers only</option>
          </Select>

          <Select
            label="Frame Duration"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(Number(e.target.value))}
          >
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
          </Select>
        </div>

        <Switch
          checked={isHighlight}
          onCheckedChange={setIsHighlight}
          label="Pin as permanent highlight"
          description="Keep this story visible past the 24-hour expiration window."
        />

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting || uploading}>
          <CirclePlus className="h-4 w-4" /> Share to Story
        </Button>
      </form>
    </AppShell>
  );
}
