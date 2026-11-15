'use client';

import React, { useEffect, useState } from 'react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ business?: Record<string, string> }>('/business')
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
    } catch (err) {
      error('Failed to save business settings', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <BusinessPortalHeader title="Business Profile Settings" subtitle="Update public branding, legal contact, and billing details." />
      <form onSubmit={handleSave} className="space-y-4">
        <Input label="Business / Organization Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-bord-pr p-3 space-y-2">
            <label className="block text-cap-l font-semibold text-lab-pr">Business Logo</label>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Business logo" className="h-14 w-14 rounded-xl object-cover border border-bord-pr" />
            )}
            <input type="file" accept="image/*" onChange={(e) => uploadAsset('logo', e)} className="text-cap-l block w-full" />
          </div>
          <div className="rounded-2xl border border-bord-pr p-3 space-y-2">
            <label className="block text-cap-l font-semibold text-lab-pr">Cover Banner</label>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="Business cover" className="h-14 w-full rounded-xl object-cover border border-bord-pr" />
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
