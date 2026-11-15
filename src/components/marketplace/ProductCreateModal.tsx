'use client';

import React, { useState } from 'react';
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
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const res = await uploadFileToR2(file, 'marketplace', 'product');
        setMediaIds((prev) => [...prev, res.mediaId]);
        setPreviewUrls((prev) => [...prev, res.publicUrl]);
      }
      success('Product images uploaded');
    } catch (err) {
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          <label className="block text-cap-l font-semibold text-lab-pr">
            {isEditing ? 'Add Product Photos' : 'Product Photos'}
          </label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageUpload}
            className="text-cap-l block w-full text-lab-sc"
          />
          {uploading ? (
            <p className="text-cap-s text-brand-900">Uploading images to Cloudflare R2...</p>
          ) : null}
          {previewUrls.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {previewUrls.map((url, idx) => {
                const resolvedPreview = resolveMediaUrl(url) || url || '/assets/products/default-preview.png';
                return (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={`${resolvedPreview}-${idx}`}
                    src={resolvedPreview}
                    alt={`Uploaded ${idx + 1}`}
                    className="size-14 rounded-xl object-cover border border-bord-card bg-fill-qt"
                    onLoad={(e) => {
                      delete e.currentTarget.dataset.fallbackApplied;
                    }}
                    onError={(e) => {
                      if (e.currentTarget.dataset.fallbackApplied === '1') return;
                      e.currentTarget.dataset.fallbackApplied = '1';
                      e.currentTarget.src = '/assets/products/default-preview.png';
                    }}
                  />
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
