'use client';

import React, { useEffect, useState } from 'react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { useToast } from '@/components/providers/ToastProvider';

export default function BusinessSettingsPage() {
  const { error, success } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [logo, setLogo] = useState('');
  const [cover, setCover] = useState('');
  const [businessState, setBusinessState] = useState<{
    configured: boolean;
    verified: boolean;
    isReviewed: boolean;
  }>({ configured: false, verified: false, isReviewed: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{
      business?: {
        name?: string;
        description?: string;
        businessEmail?: string;
        businessPhone?: string;
        website?: string;
        addressLine1?: string;
        city?: string;
        country?: string;
        taxNumber?: string;
        logo?: string;
        cover?: string;
        verified?: boolean;
        isReviewed?: boolean;
      };
    }>('/business')
      .then((res) => {
        if (!res.business) return;
        const b = res.business;
        setName(b.name || '');
        setDescription(b.description || '');
        setBusinessEmail(b.businessEmail || '');
        setBusinessPhone(b.businessPhone || '');
        setWebsite(b.website || '');
        setAddressLine1(b.addressLine1 || '');
        setCity(b.city || '');
        setCountry(b.country || '');
        setTaxNumber(b.taxNumber || '');
        setLogo(b.logo || '');
        setCover(b.cover || '');
        setBusinessState({
          configured: true,
          verified: Boolean(b.verified),
          isReviewed: Boolean(b.isReviewed),
        });
      })
      .catch(() => undefined);
  }, []);

  async function uploadAsset(kind: 'logo' | 'cover', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const up = await uploadFileToR2(file, 'business', kind === 'logo' ? 'business_logo' : 'business_cover');
      if (kind === 'logo') setLogo(up.publicUrl);
      else setCover(up.publicUrl);
      success(`${kind === 'logo' ? 'Logo' : 'Cover'} uploaded to Cloudflare R2`);
    } catch (err) {
      error('Upload failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/business', {
        method: 'POST',
        json: {
          kind: 'business_account',
          name: name.trim(),
          description: description.trim(),
          businessEmail: businessEmail.trim(),
          businessPhone: businessPhone.trim(),
          website: website.trim(),
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          country: country.trim(),
          taxNumber: taxNumber.trim(),
          logo: logo || undefined,
          cover: cover || undefined,
        },
      });
      success('Business profile saved!');
      setBusinessState((prev) => ({
        configured: true,
        verified: prev.verified,
        isReviewed: prev.isReviewed,
      }));
    } catch (err) {
      error('Failed to save business settings', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <BusinessPortalHeader title="Business Profile Settings" subtitle="Update public branding, legal contact, and billing details." />
      {businessState.configured && (
        <div className="rounded-2xl border border-bord-card bg-fill-qt/50 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-par-n font-bold text-lab-pr">Business Verification Status</p>
            <p className="text-cap-l text-lab-sc">
              {businessState.verified
                ? 'Your business account is verified and trusted across Marketplace, Jobs, and Ads.'
                : businessState.isReviewed
                  ? 'Your business verification was declined or revoked by moderation. Update your details and contact support.'
                  : 'Your business profile is awaiting administrator verification.'}
            </p>
          </div>
          <Badge variant={businessState.verified ? 'success' : businessState.isReviewed ? 'danger' : 'warning'}>
            {businessState.verified ? 'Verified' : businessState.isReviewed ? 'Declined' : 'Pending Review'}
          </Badge>
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-4">
        <Input label="Business / Organization Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-bord-pr p-3 space-y-2">
            <label className="block text-cap-l font-semibold text-lab-pr">Business Logo</label>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(logo) || logo} alt="Business logo" className="h-14 w-14 rounded-xl object-cover border border-bord-pr" />
            )}
            <input type="file" accept="image/*" onChange={(e) => uploadAsset('logo', e)} className="text-cap-l block w-full" />
          </div>
          <div className="rounded-2xl border border-bord-pr p-3 space-y-2">
            <label className="block text-cap-l font-semibold text-lab-pr">Cover Banner</label>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(cover) || cover} alt="Business cover" className="h-14 w-full rounded-xl object-cover border border-bord-pr" />
            )}
            <input type="file" accept="image/*" onChange={(e) => uploadAsset('cover', e)} className="text-cap-l block w-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Contact Email" type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} />
          <Input label="Phone" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <Input label="Tax / VAT ID" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Street Address" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" size="lg" loading={saving}>Save Business Profile</Button>
      </form>
    </div>
  );
}
