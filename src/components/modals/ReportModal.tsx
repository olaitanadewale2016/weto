'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { REPORT_REASONS } from '@/data/world';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

export type ReportTargetType = 'post' | 'user' | 'group' | 'product' | 'job' | 'comment';

export function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}) {
  const { success, error } = useToast();
  const catalogKey: 'post' | 'user' | 'group' =
    targetType === 'user' ? 'user' : targetType === 'group' ? 'group' : 'post';
  const catalog = REPORT_REASONS[catalogKey];

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    try {
      await apiFetch('/reports', {
        method: 'POST',
        json: {
          reportableType: targetType,
          reportableId: targetId,
          reasonIndex: selectedIndex,
          reasonTitle: catalog.reasons[selectedIndex]?.title,
          comment: comment.trim() || undefined,
        },
      });
      success('Report submitted', 'Thank you for keeping the community safe.');
      setComment('');
      onClose();
    } catch (err) {
      error('Could not submit report', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={catalog.title} description={catalog.description}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {catalog.reasons.map((r, idx) => (
            <button
              key={r.title}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              className={cn(
                'w-full text-left rounded-2xl border p-3 transition-colors cursor-pointer',
                selectedIndex === idx
                  ? 'border-brand-900 bg-brand-900/8'
                  : 'border-bord-pr hover:bg-fill-pr'
              )}
            >
              <p className="text-par-n font-semibold text-lab-pr">{r.title}</p>
              <p className="text-cap-l text-lab-sc mt-0.5">{r.description}</p>
            </button>
          ))}
        </div>

        <Textarea
          label="Additional details (optional)"
          placeholder="Provide extra context for our moderation team..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={submitting}>
            Submit Report
          </Button>
        </div>
      </form>
    </Modal>
  );
}
