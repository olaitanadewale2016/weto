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
  MoreHorizontal,
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
import { resolveMediaUrl } from '@/lib/media-url';
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const displayName =
    `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
  const imageUploads = uploads.filter((u) => u.mediaType === 'image');
  const otherUploads = uploads.filter((u) => u.mediaType !== 'image');

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        void handleFileSelect(e.dataTransfer.files);
      }}
      className={cn(
        'w-full max-w-full overflow-x-hidden min-w-0',
        fullScreen ? 'flex-1 flex flex-col justify-between h-full' : 'space-y-3'
      )}
    >
      {/* Main Editor Body */}
      <div
        className={cn(
          'min-w-0',
          fullScreen ? 'flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 flex flex-col gap-3' : 'flex gap-2.5'
        )}
      >
        {!fullScreen && (
          <div className="shrink-0">
            <Avatar src={user.avatar} alt={user.username} verified={user.verified} size="sm" />
          </div>
        )}

        <div className={cn('flex-1 min-w-0 space-y-2.5', fullScreen && 'flex flex-col')}>
          {!fullScreen && (
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-par-m font-semibold text-lab-pr2 truncate">{displayName}</h4>
              {isAiGenerated && (
                <span className="text-cap-s text-lab-sc font-medium shrink-0">AI generated</span>
              )}
            </div>
          )}

          {showTitle && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional headline..."
              maxLength={160}
              className="w-full bg-transparent text-[16px] md:text-par-l font-bold text-lab-pr placeholder:text-lab-tr focus:outline-none border-b border-bord-pr pb-1"
            />
          )}

          {isDragging ? (
            <div className="rounded-2xl border-2 border-dashed border-brand-900 bg-brand-900/5 py-10 text-center text-par-n text-lab-pr2">
              Drop photos, videos, audio, or documents here
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              rows={fullScreen ? 8 : 4}
              maxLength={10000}
              className={cn(
                'w-full min-w-0 bg-transparent text-lab-pr2 placeholder:text-lab-tr placeholder:font-light resize-none focus:outline-none leading-normal',
                fullScreen
                  ? 'flex-1 text-[18px] sm:text-title-3 placeholder:text-[18px] sm:placeholder:text-title-3'
                  : 'text-[16px] md:text-par-l min-h-[84px]'
              )}
            />
          )}

          {showLocation && (
            <div className="flex items-center gap-2 rounded-xl bg-input-pr px-3 py-1.5 border border-bord-tr min-w-0">
              <MapPin className="h-4 w-4 text-lab-sc shrink-0" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add city or place..."
                className="flex-1 min-w-0 bg-transparent text-[16px] md:text-cap-l text-lab-pr focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowLocation(false)}
                className="text-lab-tr hover:text-lab-pr shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {showGif && (
            <div className="space-y-2 min-w-0">
              {gifUrl && (
                <div className="relative inline-block rounded-2xl overflow-hidden border border-bord-card bg-fill-pr max-w-full sm:max-w-xs">
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

          {/* PHP 3-col image upload grid + media previews */}
          {imageUploads.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {imageUploads.map((u) => (
                <div
                  key={u.mediaId}
                  className="relative aspect-square rounded-lg border border-bord-card overflow-hidden bg-fill-tr"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveMediaUrl(u.publicUrl) || u.publicUrl}
                    alt="Upload preview"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setUploads((prev) => prev.filter((item) => item.mediaId !== u.mediaId))}
                    className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {otherUploads.length > 0 && (
            <div className="space-y-1.5">
              {otherUploads.map((u) => (
                <div
                  key={u.mediaId}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-bord-card bg-fill-fv/50 px-3 py-2"
                >
                  <span className="text-par-s text-lab-pr truncate">
                    {u.mediaType.toUpperCase()} attachment ready
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploads((prev) => prev.filter((item) => item.mediaId !== u.mediaId))}
                    className="size-6 rounded-full bg-fill-sc text-lab-pr flex items-center justify-center shrink-0 cursor-pointer"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Poll Builder matching PHP PostPollForm.vue */}
          {showPoll && (
            <div className="rounded-2xl border border-bord-pr bg-fill-fv/50 p-3.5 space-y-2.5 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-cap-l font-semibold text-lab-pr">Poll options</span>
                <button
                  type="button"
                  onClick={() => setShowPoll(false)}
                  className="text-lab-tr hover:text-lab-pr"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {pollChoices.map((choice, idx) => (
                <div key={idx} className="flex items-center gap-2 min-w-0">
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
                    className="flex-1 min-w-0 h-10 rounded-xl bg-input-pr border border-bord-pr px-3 text-[16px] md:text-par-n text-lab-pr"
                  />
                  {pollChoices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollChoices((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-lab-tr hover:text-red-900 shrink-0"
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
                    className="rounded-lg bg-input-pr border border-bord-pr px-2 py-1 text-[16px] md:text-cap-s text-lab-pr"
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
        </div>
      </div>

      {/* PHP Upload Progress Bar */}
      {uploadProgress !== null && (
        <div className="w-full h-1 bg-fill-tr overflow-hidden shrink-0">
          <div
            className="h-full bg-green-900 transition-all"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Action Toolbar + Helper Note */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <div
        className={cn(
          'shrink-0',
          fullScreen
            ? 'px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] pb-safe-standalone border-t border-bord-tr/60 bg-bg-pr space-y-2'
            : 'pt-2 border-t border-bord-pr space-y-2.5'
        )}
      >
        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() => triggerPicker('image/*')}
              className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
              title="Add images"
            >
              <ImageIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => triggerPicker('video/*')}
              className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
              title="Add video"
            >
              <Video className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => triggerPicker('audio/*')}
              className="p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
              title="Add audio"
            >
              <Music className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => triggerPicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar')}
              className="inline-flex p-2 rounded-full text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr transition-colors cursor-pointer"
              title="Attach document"
            >
              <FileText className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setShowPoll((v) => !v)}
              className={cn(
                'p-2 rounded-full transition-colors cursor-pointer',
                showPoll ? 'bg-fill-sc text-lab-pr' : 'text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr'
              )}
              title="Create poll"
            >
              <BarChart2 className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setShowGif((v) => !v)}
              className={cn(
                'px-2 py-1.5 rounded-full transition-colors cursor-pointer text-cap-s font-bold',
                showGif ? 'bg-fill-sc text-lab-pr' : 'text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr'
              )}
              title="Add GIF"
            >
              GIF
            </button>

            <span className="w-px h-4 bg-bord-sc mx-0.5 hidden sm:inline-block" />

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen((v) => !v);
                  setMoreMenuOpen(false);
                }}
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
                <div className="absolute bottom-full right-0 sm:left-0 sm:right-auto mb-2 w-48 max-w-[calc(100vw-2rem)] rounded-2xl border border-bord-card bg-bg-pr p-1.5 shadow-xl z-40 space-y-0.5">
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

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen((v) => !v);
                  setAiMenuOpen(false);
                }}
                className={cn(
                  'p-2 rounded-full transition-colors cursor-pointer',
                  moreMenuOpen || showTitle || showLocation || isSensitive || isAiGenerated
                    ? 'bg-fill-sc text-lab-pr'
                    : 'text-lab-pr3 hover:text-lab-pr hover:bg-fill-tr'
                )}
                title="More publication options"
              >
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </button>
              {moreMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-52 max-w-[calc(100vw-2rem)] rounded-2xl border border-bord-card bg-bg-pr p-1.5 shadow-xl z-40 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerPicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar');
                      setMoreMenuOpen(false);
                    }}
                    className="w-full sm:hidden text-left px-3 py-2 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="h-4 w-4 text-lab-sc" /> Attach document
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTitle((v) => !v);
                      setMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr flex items-center justify-between cursor-pointer"
                  >
                    <span>{showTitle ? 'Hide headline' : 'Add headline'}</span>
                    <span className="text-[11px] font-bold text-lab-sc">H1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocation((v) => !v);
                      setMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr flex items-center gap-2 cursor-pointer"
                  >
                    <MapPin className="h-4 w-4 text-lab-sc" /> {showLocation ? 'Remove location' : 'Add location'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSensitive((v) => !v);
                      setMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr flex items-center gap-2 cursor-pointer"
                  >
                    <AlertTriangle className={cn('h-4 w-4', isSensitive ? 'text-red-900' : 'text-lab-sc')} />
                    {isSensitive ? 'Unmark sensitive' : 'Mark sensitive content'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiGenerated((v) => !v);
                      setMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-cap-l text-lab-pr2 hover:bg-fill-tr flex items-center gap-2 cursor-pointer"
                  >
                    <Bot className="h-4 w-4 text-lab-sc" />
                    {isAiGenerated ? 'Unmark AI generated' : 'Mark as AI generated'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={submitting || uploadProgress !== null}
            className="shrink-0"
          >
            <Send className="h-3.5 w-3.5" /> {dict.feed.publish}
          </Button>
        </div>

        <p className="text-cap-s text-lab-sc leading-normal">
          Everyone who can view your profile will see this publication in their timeline.
        </p>
      </div>
    </form>
  );
}
