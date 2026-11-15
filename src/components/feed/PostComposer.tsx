'use client';

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Bot,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Music,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { apiFetch, uploadFileToR2, UploadedMediaResult } from '@/lib/api-client';
import { GiphyAttribution, GiphyPicker } from '@/components/feed/GiphyPicker';
import { cn } from '@/lib/utils';

export function PostComposer({
  quotePostId,
  onCreated,
  placeholder = "What's new?",
  fullScreen = false,
}: {
  quotePostId?: string;
  onCreated?: (post: unknown) => void;
  placeholder?: string;
  fullScreen?: boolean;
}) {
  const { user, dict, locale } = useApp();
  const { error, success } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [showTitle, setShowTitle] = useState(false);
  const [location, setLocation] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [gifUrl, setGifUrl] = useState('');
  const [showGif, setShowGif] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [uploads, setUploads] = useState<UploadedMediaResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [showPoll, setShowPoll] = useState(false);
  const [pollChoices, setPollChoices] = useState(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollHours, setPollHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function handleAiAssist(mode: 'draft' | 'improve' | 'hashtags' | 'summary') {
    const promptInput = content.trim() || title.trim() || placeholder;
    if (promptInput.length < 2) {
      error('Enter a topic or draft first for AI assistance.');
      return;
    }
    setAiLoading(true);
    setAiMenuOpen(false);
    try {
      const res = await apiFetch<{ content?: string; provider?: string }>('/ai/compose', {
        method: 'POST',
        json: {
          mode,
          prompt: promptInput,
          locale,
        },
      });
      if (res.content) {
        if (mode === 'hashtags' && content.trim() && !res.content.includes(content.trim())) {
          setContent(`${content.trim()}\n\n${res.content.trim()}`);
        } else {
          setContent(res.content.trim());
        }
        setIsAiGenerated(true);
        success('AI suggestion applied');
      }
    } catch (err) {
      error('AI assistant unavailable', err instanceof Error ? err.message : undefined);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, 10 - uploads.length);
    for (const file of list) {
      try {
        setUploadProgress(5);
        const uploaded = await uploadFileToR2(file, 'posts', 'post', (pct) => setUploadProgress(pct));
        setUploads((prev) => [...prev, uploaded]);
      } catch (err) {
        error('Media upload failed', err instanceof Error ? err.message : undefined);
      } finally {
        setUploadProgress(null);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function triggerPicker(accept: string) {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedPoll = pollChoices.map((c) => c.trim()).filter(Boolean);
    if (!content.trim() && uploads.length === 0 && !gifUrl.trim() && (!showPoll || trimmedPoll.length < 2)) {
      error('Nothing to publish', 'Write something, attach media, or add at least 2 poll choices.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        content: content.trim(),
        ...(showTitle && title.trim() ? { title: title.trim() } : {}),
        ...(showLocation && location.trim() ? { location: location.trim() } : {}),
        ...(isSensitive ? { isSensitive: true } : {}),
        ...(isAiGenerated ? { isAiGenerated: true } : {}),
        ...(quotePostId ? { quotePostId } : {}),
        ...(uploads.length > 0 ? { mediaIds: uploads.map((u) => u.mediaId) } : {}),
        ...(showGif && gifUrl.trim() ? { gifUrl: gifUrl.trim() } : {}),
        ...(showPoll && trimmedPoll.length >= 2
          ? {
            poll: {
              choices: trimmedPoll,
              isAnonymous: pollAnonymous,
              isCancellable: true,
              expiresHours: pollHours,
            },
          }
          : {}),
      };

      const created = await apiFetch('/posts', { method: 'POST', json: payload });
      success('Publication posted!');
      setContent('');
      setTitle('');
      setShowTitle(false);
      setLocation('');
      setShowLocation(false);
      setGifUrl('');
      setShowGif(false);
      setIsSensitive(false);
      setIsAiGenerated(false);
      setUploads([]);
      setShowPoll(false);
      setPollChoices(['', '']);
      onCreated?.(created);
    } catch (err) {
      error('Could not publish', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        fullScreen ? 'flex-1 flex flex-col justify-between p-4 sm:p-6' : 'p-4 space-y-3'
      )}
    >
      <div className={cn('flex gap-3', fullScreen && 'flex-1')}>
        <Avatar src={user.avatar} alt={user.username} verified={user.verified} size="sm" />
        <div className={cn('flex-1 min-w-0 space-y-2.5', fullScreen && 'flex flex-col')}>
          {showTitle && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional headline..."
              maxLength={160}
              className="w-full bg-transparent text-par-l font-bold text-lab-pr placeholder:text-lab-tr focus:outline-none border-b border-bord-pr pb-1"
            />
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            rows={fullScreen ? 8 : 4}
            maxLength={10000}
            className={cn(
              'w-full bg-transparent text-lab-pr placeholder:text-lab-tr placeholder:font-light resize-none focus:outline-none leading-normal',
              fullScreen ? 'flex-1 text-title-3' : 'text-par-l'
            )}
          />

          {showLocation && (
            <div className="flex items-center gap-2 rounded-xl bg-input-pr px-3 py-1.5 border border-bord-tr">
              <MapPin className="h-4 w-4 text-lab-sc shrink-0" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add city or place..."
                className="flex-1 bg-transparent text-cap-l text-lab-pr focus:outline-none"
              />
              <button type="button" onClick={() => setShowLocation(false)} className="text-lab-tr hover:text-lab-pr">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {showGif && (
            <div className="space-y-2">
              {gifUrl && (
                <div className="relative inline-block rounded-2xl overflow-hidden border border-bord-card bg-fill-pr max-w-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gifUrl} alt="Selected GIF" className="max-h-48 w-auto object-cover" />
                  <GiphyAttribution className="absolute bottom-2 left-2 z-10" />
                  <button
                    type="button"
                    onClick={() => setGifUrl('')}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                    aria-label="Remove GIF"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {!gifUrl && (
                <GiphyPicker
                  onSelect={(url) => {
                    setGifUrl(url);
                  }}
                  onClose={() => {
                    setShowGif(false);
                    setGifUrl('');
                  }}
                />
              )}
            </div>
          )}

          {/* Uploaded media previews */}
          {uploads.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {uploads.map((u, idx) => (
                <div
                  key={u.mediaId}
                  className="relative rounded-2xl border border-bord-card overflow-hidden bg-fill-pr aspect-video flex items-center justify-center"
                >
                  {u.mediaType === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.publicUrl} alt="Upload preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="p-2 text-center text-cap-s text-lab-sc truncate">
                      {u.mediaType.toUpperCase()} attached
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setUploads((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadProgress !== null && (
            <div className="w-full h-1.5 rounded-full bg-fill-sc overflow-hidden">
              <div
                className="h-full bg-brand-900 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {/* Poll Builder */}
          {showPoll && (
            <div className="rounded-2xl border border-bord-pr bg-fill-pr/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-cap-l font-semibold text-lab-pr">Create Poll</span>
                <button type="button" onClick={() => setShowPoll(false)} className="text-lab-tr hover:text-lab-pr">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {pollChoices.map((choice, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={choice}
                    onChange={(e) => {
                      const next = [...pollChoices];
                      next[idx] = e.target.value;
                      setPollChoices(next);
                    }}
                    placeholder={`Choice ${idx + 1}`}
                    maxLength={100}
                    className="flex-1 h-9 rounded-xl bg-input-pr border border-bord-pr px-3 text-par-n text-lab-pr"
                  />
                  {pollChoices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollChoices((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-lab-tr hover:text-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {pollChoices.length < 6 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPollChoices((prev) => [...prev, ''])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add choice
                  </Button>
                )}
                <div className="flex items-center gap-3 text-cap-s text-lab-sc">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pollAnonymous}
                      onChange={(e) => setPollAnonymous(e.target.checked)}
                    />
                    Anonymous
                  </label>
                  <select
                    value={pollHours}
                    onChange={(e) => setPollHours(Number(e.target.value))}
                    className="rounded-lg bg-input-pr border border-bord-pr px-2 py-1 text-cap-s text-lab-pr"
                  >
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-bord-pr">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => triggerPicker('image/*')}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
                title="Add images"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => triggerPicker('video/*')}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
                title="Add video"
              >
                <Video className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => triggerPicker('audio/*')}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
                title="Add audio"
              >
                <Music className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => triggerPicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar')}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
                title="Attach document"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowPoll((v) => !v)}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
                title="Create poll"
              >
                <BarChart2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowLocation((v) => !v)}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
                title="Add location"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowGif((v) => !v)}
                className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer text-cap-s font-bold"
                title="Add GIF"
              >
                GIF
              </button>
              <button
                type="button"
                onClick={() => setShowTitle((v) => !v)}
                className="px-2 py-1 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer text-cap-s font-semibold"
                title="Toggle headline"
              >
                H1
              </button>
              <button
                type="button"
                onClick={() => setIsSensitive((v) => !v)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${isSensitive ? 'bg-red-900/15 text-red-900' : 'text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr'
                  }`}
                title="Mark sensitive content"
              >
                <AlertTriangle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsAiGenerated((v) => !v)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${isAiGenerated ? 'bg-fill-sc text-lab-pr' : 'text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr'
                  }`}
                title="Mark AI-assisted"
              >
                <Bot className="h-4 w-4" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAiMenuOpen((v) => !v)}
                  disabled={aiLoading}
                  className={cn(
                    'p-2 rounded-full transition-colors cursor-pointer inline-flex items-center gap-1',
                    aiMenuOpen ? 'bg-fill-sc text-lab-pr' : 'text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr'
                  )}
                  title="AI writing assistant"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </button>
                {aiMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 rounded-2xl border border-bord-card bg-bg-pr p-1.5 shadow-xl z-30 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => handleAiAssist('draft')}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr cursor-pointer"
                    >
                      Draft post from topic
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAiAssist('improve')}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr cursor-pointer"
                    >
                      Improve writing
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAiAssist('hashtags')}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr cursor-pointer"
                    >
                      Add hashtags
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAiAssist('summary')}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr cursor-pointer"
                    >
                      Summarize draft
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              <Send className="h-3.5 w-3.5" /> {dict.feed.publish}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
