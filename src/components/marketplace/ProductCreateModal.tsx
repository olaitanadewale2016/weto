'use client';

import React, { useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

export interface MarketplaceCategoryOption {
  id: string;
  name: string;
}

export interface EditableProductData {
  id: string;
  title: string;
  description?: string;
  categoryId?: string;
  condition?: string;
  type?: string;
  currency?: string;
  stockQuantity?: number;
  price: number;
  discount?: number;
  address?: string;
  existingMedia?: Array<{ id?: string; url?: string; publicUrl?: string }>;
}

interface ProductCreateModalProps {
  open: boolean;
  onClose: () => void;
  categories: MarketplaceCategoryOption[];
  editProduct?: EditableProductData | null;
  onSaved: () => void;
}

export function ProductCreateModal({
  open,
  onClose,
  categories,
  editProduct,
  onSaved,
}: ProductCreateModalProps) {
  if (!open) return null;

  return (
    <ProductCreateModalInner
      key={editProduct?.id || 'create'}
      onClose={onClose}
      categories={categories}
      editProduct={editProduct}
      onSaved={onSaved}
    />
  );
}

function ProductCreateModalInner({
  onClose,
  categories,
  editProduct,
  onSaved,
}: Omit<ProductCreateModalProps, 'open'>) {
  const { bootstrap } = useApp();
  const { error, success } = useToast();
  const isEditing = Boolean(editProduct);

  const [title, setTitle] = useState(editProduct?.title || '');
  const [description, setDescription] = useState(editProduct?.description || '');
  const [price, setPrice] = useState(editProduct ? String(editProduct.price) : '49.99');
  const [discount, setDiscount] = useState(editProduct ? String(editProduct.discount ?? 0) : '0');
  const [stockQuantity, setStockQuantity] = useState(
    editProduct?.stockQuantity !== undefined ? String(editProduct.stockQuantity) : '1'
  );
  const [currency, setCurrency] = useState(editProduct?.currency || '');
  const selectedCurrency = currency || bootstrap?.config?.defaultCurrency || 'NGN';
  const [categoryId, setCategoryId] = useState(editProduct?.categoryId || '');
  const [condition, setCondition] = useState(editProduct?.condition || 'new');
  const [type, setType] = useState(editProduct?.type || 'physical');
  const [address, setAddress] = useState(editProduct?.address || '');
  const [existingPhotos, setExistingPhotos] = useState<Array<{ id: string; url: string }>>(() =>
    (editProduct?.existingMedia || [])
      .map((m) => ({
        id: String(m.id || ''),
        url: resolveMediaUrl(m.publicUrl || m.url) || m.publicUrl || m.url || '',
      }))
      .filter((m) => Boolean(m.id && m.url))
  );
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<
    Array<{ mediaId?: string; previewUrl: string; uploading?: boolean }>
  >([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const uploading = uploadingCount > 0;
  const mediaIds = uploadedPhotos
    .map((p) => p.mediaId)
    .filter((id): id is string => Boolean(id));

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;

    const remainingSlots = Math.max(0, 10 - existingPhotos.length - uploadedPhotos.length);
    if (remainingSlots === 0) {
      error('Photo limit reached', 'You can attach up to 10 photos per listing.');
      return;
    }

    const picked = Array.from(files).slice(0, remainingSlots);
    setUploadingCount((c) => c + picked.length);

    let uploadedAny = 0;
    let firstErr: string | undefined;

    for (const file of picked) {
      const localPreview = URL.createObjectURL(file);
      setUploadedPhotos((prev) => [...prev, { previewUrl: localPreview, uploading: true }]);
      try {
        const res = await uploadFileToR2(file, 'marketplace', 'product');
        const resolvedUrl = resolveMediaUrl(res.publicUrl) || res.publicUrl || localPreview;
        setUploadedPhotos((prev) =>
          prev.map((item) =>
            item.previewUrl === localPreview
              ? { mediaId: res.mediaId, previewUrl: resolvedUrl, uploading: false }
              : item
          )
        );
        uploadedAny += 1;
        setTimeout(() => URL.revokeObjectURL(localPreview), 2500);
      } catch (err) {
        firstErr = firstErr || (err instanceof Error ? err.message : 'Upload failed');
        setUploadedPhotos((prev) => prev.filter((item) => item.previewUrl !== localPreview));
        URL.revokeObjectURL(localPreview);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }

    if (uploadedAny > 0 && !firstErr) {
      success(uploadedAny === 1 ? 'Product image uploaded' : `${uploadedAny} product images uploaded`);
    } else if (firstErr) {
      error(
        uploadedAny > 0 ? `Uploaded ${uploadedAny} photo(s), some failed` : 'Upload failed',
        firstErr
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading) return;
    setSubmitting(true);
    try {
      if (isEditing && editProduct) {
        await apiFetch(`/marketplace/${editProduct.id}`, {
          method: 'PATCH',
          json: {
            action: 'update',
            title: title.trim(),
            description: description.trim(),
            categoryId: categoryId || null,
            condition,
            type,
            currency: selectedCurrency,
            stockQuantity: Math.max(0, Number(stockQuantity) || 0),
            price: Number(price) || 0,
            discount: Number(discount) || 0,
            address: address.trim(),
            ...(mediaIds.length > 0 ? { mediaIds } : {}),
            ...(removedMediaIds.length > 0 ? { removeMediaIds: removedMediaIds } : {}),
          },
        });
        success('Product updated!');
      } else {
        await apiFetch('/marketplace', {
          method: 'POST',
          json: {
            title: title.trim(),
            description: description.trim(),
            categoryId: categoryId || undefined,
            condition,
            type,
            currency: selectedCurrency,
            stockQuantity: Math.max(0, Number(stockQuantity) || 1),
            price: Number(price) || 0,
            discount: Number(discount) || 0,
            address: address.trim() || undefined,
            mediaIds,
            publishNow: true,
          },
        });
        success('Product listing published!');
      }
      onSaved();
      onClose();
    } catch (err) {
      error(
        isEditing ? 'Failed to update product' : 'Failed to publish listing',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit Product Listing' : 'Create Product Listing'}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea
          label="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input
            label="Price"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Input
            label="Discount %"
            type="number"
            min="0"
            max="99"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
          <Input
            label="Stock"
            type="number"
            min="0"
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
          />
          <Select label="Currency" value={selectedCurrency} onChange={(e) => setCurrency(e.target.value)}>
            {(bootstrap?.currencies?.length
              ? bootstrap.currencies
              : [
                  {
                    code: bootstrap?.config?.defaultCurrency || 'NGN',
                    name: bootstrap?.config?.defaultCurrency || 'NGN',
                    symbol: '₦',
                  },
                ]
            ).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} ({c.symbol})
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="refurbished">Refurbished</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Listing Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="physical">Physical Product</option>
            <option value="digital">Digital Download</option>
          </Select>
          <Input
            label="Location / City"
            placeholder="e.g. Lagos, Abuja"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-cap-l font-semibold text-lab-pr">
              {isEditing ? 'Product Photos (Add or Remove)' : 'Product Photos'}
            </label>
            <span className="text-cap-s text-lab-sc">
              {existingPhotos.length + uploadedPhotos.length}/10
            </span>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full border border-bord-pr bg-fill-qt/60 px-3.5 py-2 text-cap-l font-semibold text-lab-pr hover:bg-fill-tr cursor-pointer transition-colors">
            <Upload className="h-3.5 w-3.5" />
            <span>{uploading ? 'Uploading photos...' : 'Choose Photos'}</span>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
          {uploading ? (
            <p className="text-cap-s text-brand-900">Uploading images to Cloudflare R2...</p>
          ) : null}
          {existingPhotos.length > 0 || uploadedPhotos.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {existingPhotos.map((photo) => (
                <div
                  key={`existing-${photo.id}`}
                  className="relative size-16 rounded-xl overflow-hidden border border-bord-card bg-fill-qt"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt="Existing product photo"
                    className="h-full w-full object-cover"
                    onLoad={(e) => {
                      delete e.currentTarget.dataset.fallbackApplied;
                    }}
                    onError={(e) => {
                      if (e.currentTarget.dataset.fallbackApplied === '1') return;
                      e.currentTarget.dataset.fallbackApplied = '1';
                      e.currentTarget.src = '/assets/products/default-preview.png';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setExistingPhotos((prev) => prev.filter((item) => item.id !== photo.id));
                      setRemovedMediaIds((prev) =>
                        prev.includes(photo.id) ? prev : [...prev, photo.id]
                      );
                    }}
                    className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                    aria-label="Remove existing photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {uploadedPhotos.map((item, idx) => {
                const resolvedPreview =
                  resolveMediaUrl(item.previewUrl) ||
                  item.previewUrl ||
                  '/assets/products/default-preview.png';
                return (
                  <div
                    key={`${item.mediaId || resolvedPreview}-${idx}`}
                    className="relative size-16 rounded-xl overflow-hidden border border-bord-card bg-fill-qt"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedPreview}
                      alt={`Uploaded ${idx + 1}`}
                      className="h-full w-full object-cover"
                      onLoad={(e) => {
                        delete e.currentTarget.dataset.fallbackApplied;
                      }}
                      onError={(e) => {
                        if (e.currentTarget.dataset.fallbackApplied === '1') return;
                        e.currentTarget.dataset.fallbackApplied = '1';
                        e.currentTarget.src = '/assets/products/default-preview.png';
                      }}
                    />
                    {item.uploading ? (
                      <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setUploadedPhotos((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                        aria-label="Remove uploaded photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting || uploading}
        >
          {isEditing ? 'Save Changes' : 'Publish Listing'}
        </Button>
      </form>
    </Modal>
  );
}
