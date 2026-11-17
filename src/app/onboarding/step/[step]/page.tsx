'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, MapPin, Upload } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { AuthShell } from '@/components/auth/AuthShell';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { COUNTRIES } from '@/data/world';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

const STEPS = ['profile', 'country', 'city', 'username'] as const;
type OnboardingStep = (typeof STEPS)[number];

export default function OnboardingStepPage() {
  const params = useParams<{ step: string }>();
  const router = useRouter();
  const { user, refreshBootstrap } = useApp();
  const { error, success } = useToast();

  const currentStep: OnboardingStep = STEPS.includes(params.step as OnboardingStep)
    ? (params.step as OnboardingStep)
    : 'profile';

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [country, setCountry] = useState((user?.country || 'NG').toUpperCase());
  const [detectedCountry, setDetectedCountry] = useState<string | null>(user?.country?.toUpperCase() || null);
  const [city, setCity] = useState(user?.city || '');
  const [username, setUsername] = useState(user?.username || '');
  const [loading, setLoading] = useState(false);
  const userEditedCountryRef = useRef(false);
  const userEditedCityRef = useRef(false);

  useEffect(() => {
    let active = true;
    const savedCountry = user?.country?.trim().toUpperCase() || null;
    if (savedCountry && !userEditedCountryRef.current) {
      setCountry(savedCountry);
      setDetectedCountry(savedCountry);
    }
    if (user?.city?.trim() && !userEditedCityRef.current) {
      setCity(user.city.trim());
    }

    apiFetch<{ country?: string | null; city?: string | null; unknown?: boolean }>('/geo')
      .then((geo) => {
        if (!active) return;
        const geoCountry = geo?.country?.trim().toUpperCase() || null;
        if (geoCountry) {
          setDetectedCountry(geoCountry);
          if (!userEditedCountryRef.current && !savedCountry) {
            setCountry(geoCountry);
          }
        }
        const geoCity = geo?.city?.trim() || null;
        if (geoCity && !userEditedCityRef.current && !user?.city) {
          setCity((prev) => prev || geoCity);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [user?.country, user?.city]);

  const countryOptions = useMemo(() => {
    const exists = COUNTRIES.some((c) => c.code === country);
    if (exists || !country || country.length !== 2) return COUNTRIES;
    let resolvedName = country;
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      resolvedName = displayNames.of(country) || country;
    } catch {
      resolvedName = country;
    }
    return [{ code: country, name: resolvedName }, ...COUNTRIES];
  }, [country]);

  const stepIndex = STEPS.indexOf(currentStep);

  async function submitStep(skip = false) {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { step: currentStep, skip };
      if (currentStep === 'profile') {
        payload.firstName = firstName.trim();
        payload.lastName = lastName.trim();
        payload.bio = bio.trim();
        payload.gender = gender;
        if (avatarUrl) payload.avatar = avatarUrl;
      } else if (currentStep === 'country') {
        payload.country = country;
      } else if (currentStep === 'city') {
        payload.city = city.trim();
      } else if (currentStep === 'username') {
        payload.username = username.trim();
      }

      const res = await apiFetch<{ status: string; onboardingStep: string | null }>(
        '/auth/onboarding',
        { method: 'POST', json: payload }
      );
      await refreshBootstrap();
      if (res.onboardingStep) {
        router.push(`/onboarding/step/${res.onboardingStep}`);
      } else {
        success('Profile setup complete!');
        router.push('/');
      }
    } catch (err) {
      error('Could not save step', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading="Complete your profile"
      subheading={`Step ${stepIndex + 1} of ${STEPS.length} — set up your account`}
    >
      <div className="space-y-6">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {STEPS.map((s, idx) => (
              <div
                key={s}
                className={`h-1.5 rounded-full ${idx <= stepIndex ? 'bg-lab-pr2' : 'bg-fill-sc'}`}
              />
            ))}
          </div>
        </div>

        {currentStep === 'profile' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitStep(false);
            }}
            className="space-y-4"
          >
            <h1 className="text-title-1 font-bold text-lab-pr">Tell us about yourself</h1>
            <div className="rounded-2xl border border-bord-pr bg-fill-fv/40 p-3.5 space-y-3">
              <div className="flex items-center gap-4">
                <Avatar src={avatarUrl || user?.avatar} alt={firstName || 'Profile'} size="lg" />
                <label className="inline-flex items-center gap-2 rounded-full border border-bord-pr bg-bg-pr px-4 py-2 text-cap-l font-semibold text-lab-pr cursor-pointer hover:bg-fill-pr">
                  <Upload className="h-4 w-4" />
                  {uploadingAvatar ? 'Uploading photo...' : 'Upload Profile Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setUploadingAvatar(true);
                      try {
                        const uploaded = await uploadFileToR2(file, 'avatars', 'user_avatar');
                        setAvatarUrl(uploaded.publicUrl);
                        success('Profile photo uploaded');
                      } catch (err) {
                        error('Upload failed', err instanceof Error ? err.message : undefined);
                      } finally {
                        setUploadingAvatar(false);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="border-t border-bord-pr pt-3">
                <AvatarPresetPicker
                  selectedUrl={avatarUrl || user?.avatar}
                  onSelect={(url) => setAvatarUrl(url)}
                  disabled={uploadingAvatar}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <Select
              label="Gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Prefer not to say / Other</option>
            </Select>
            <Textarea
              label="Bio"
              placeholder="Share a short bio with the community..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={240}
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        {currentStep === 'country' && (
          <div className="space-y-4">
            <h1 className="text-title-1 font-bold text-lab-pr">Where are you based?</h1>
            <Select
              label="Country"
              value={country}
              onChange={(e) => {
                userEditedCountryRef.current = true;
                setCountry(e.target.value);
              }}
            >
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
            {detectedCountry && detectedCountry === country && (
              <p className="text-cap-s text-lab-sc flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                Detected automatically from your location. You can choose any country.
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => submitStep(true)} disabled={loading}>
                Skip
              </Button>
              <Button type="button" variant="primary" className="flex-1" onClick={() => submitStep(false)} loading={loading}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'city' && (
          <div className="space-y-4">
            <h1 className="text-title-1 font-bold text-lab-pr">Which city?</h1>
            <Input
              label="City"
              placeholder="Lagos, Abuja, London..."
              value={city}
              onChange={(e) => {
                userEditedCityRef.current = true;
                setCity(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => submitStep(true)} disabled={loading}>
                Skip
              </Button>
              <Button type="button" variant="primary" className="flex-1" onClick={() => submitStep(false)} loading={loading}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'username' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitStep(false);
            }}
            className="space-y-4"
          >
            <h1 className="text-title-1 font-bold text-lab-pr">Choose your @username</h1>
            <Input
              label="Username"
              placeholder="alex_morgan"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="^[a-zA-Z0-9._]{2,32}$"
              required
              hint="Letters, numbers, dots, and underscores only."
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              <CheckCircle2 className="h-4 w-4" /> Complete Setup
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
