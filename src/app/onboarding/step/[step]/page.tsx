'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { AuthShell } from '@/components/auth/AuthShell';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { COUNTRIES } from '@/data/world';
import { clearBootstrapCache, useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

const STEPS = ['profile', 'country', 'city', 'username'] as const;
type OnboardingStep = (typeof STEPS)[number];

export default function OnboardingStepPage() {
  const params = useParams<{ step: string }>();
  const router = useRouter();
  const { user, loading: appLoading, refreshBootstrap, bootstrap } = useApp();
  const { error, success } = useToast();

  const appName = bootstrap?.config?.appName || 'Weto';

  const currentStep: OnboardingStep = STEPS.includes(params.step as OnboardingStep)
    ? (params.step as OnboardingStep)
    : 'profile';

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(
    user?.gender === 'male' || user?.gender === 'female' ? user.gender : 'other'
  );
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [country, setCountry] = useState((user?.country || 'NG').toUpperCase());
  const [detectedCountry, setDetectedCountry] = useState<string | null>(
    user?.country?.toUpperCase() || null
  );
  const [city, setCity] = useState(user?.city || '');
  const [username, setUsername] = useState(user?.username || '');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const userEditedCountryRef = useRef(false);
  const userEditedCityRef = useRef(false);

  // Redirect active users to home or unauthenticated users to login
  useEffect(() => {
    if (appLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    if (user.status === 'active') {
      router.replace('/');
    }
  }, [user, appLoading, router]);

  // Synchronize state when user data finishes loading
  useEffect(() => {
    if (!user) return;
    setFirstName((prev) => prev || user.firstName || '');
    setLastName((prev) => prev || user.lastName || '');
    setBio((prev) => prev || user.bio || '');
    if (user.gender === 'male' || user.gender === 'female') {
      setGender(user.gender);
    }
    setAvatarUrl((prev) => prev || user.avatar || '');
    setUsername((prev) => prev || user.username || '');
    if (user.country && !userEditedCountryRef.current) {
      setCountry(user.country.toUpperCase());
    }
    if (user.city && !userEditedCityRef.current) {
      setCity(user.city);
    }
  }, [user]);

  // Geo detection for Country & City
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

  // Debounced live username availability check
  useEffect(() => {
    if (currentStep !== 'username') return;
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
      setUsernameAvailable(null);
      setUsernameChecking(false);
      return;
    }
    if (!/^[a-zA-Z0-9._]{2,32}$/.test(trimmed)) {
      setUsernameAvailable(false);
      setUsernameChecking(false);
      return;
    }
    if (user?.username && trimmed === user.username.toLowerCase()) {
      setUsernameAvailable(true);
      setUsernameChecking(false);
      return;
    }

    setUsernameChecking(true);
    const timer = setTimeout(() => {
      apiFetch<{ available: boolean }>(`/auth/onboarding?check_username=${encodeURIComponent(trimmed)}`)
        .then((res) => {
          setUsernameAvailable(res.available);
        })
        .catch(() => {
          setUsernameAvailable(null);
        })
        .finally(() => {
          setUsernameChecking(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [username, currentStep, user?.username]);

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
        payload.username = username.trim().toLowerCase();
      }

      const res = await apiFetch<{ status: string; onboardingStep: string | null }>(
        '/auth/onboarding',
        { method: 'POST', json: payload }
      );

      clearBootstrapCache();
      await refreshBootstrap();

      if (res.onboardingStep) {
        router.push(`/onboarding/step/${res.onboardingStep}`);
      } else {
        success('Profile setup complete!', `Welcome to ${appName}!`);
        router.replace('/');
      }
    } catch (err) {
      error('Could not save step', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div>
        {/* Header matching PHP ColibriPlus index.blade.php form-header */}
        <div className="mb-6 text-center">
          <div className="flex justify-center mb-2.5">
            <div className="size-11 rounded-full bg-brand-900/10 flex items-center justify-center text-brand-900">
              <UserIcon className="size-6" />
            </div>
          </div>
          <h1 className="text-title-2 font-semibold text-lab-pr2">Almost done!</h1>
          <p className="text-par-m text-lab-sc mt-1">
            Just a few more steps to set up your account
          </p>
        </div>

        {/* Sleek Step Progress Indicator matching ColibriPlus index.blade.php */}
        <div className="mb-6">
          <div className="flex justify-between items-center text-cap-l text-lab-sc font-medium mb-1.5">
            <span>Step {stepIndex + 1} of {STEPS.length}</span>
            <span className="capitalize">{currentStep}</span>
          </div>
          <div className="h-1 bg-fill-sc rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-900 transition-all duration-300 rounded-full"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* STEP 1: PROFILE */}
        {currentStep === 'profile' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitStep(false);
            }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-bord-pr bg-fill-fv/40 p-3.5 space-y-3">
              <div className="flex items-center gap-4">
                <Avatar src={avatarUrl || user?.avatar} alt={firstName || 'Profile'} size="lg" />
                <label className="inline-flex items-center gap-2 rounded-full border border-bord-pr bg-bg-pr px-4 py-2 text-cap-l font-semibold text-lab-pr cursor-pointer hover:bg-fill-pr transition-colors">
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
                placeholder="What's your name?"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                minLength={2}
                maxLength={32}
              />
              <Input
                label="Last Name"
                placeholder="What's your last name?"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={32}
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

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-cap-l font-medium text-lab-pr2">Bio</label>
                <span className="text-[11px] text-lab-sc">{bio.length}/240</span>
              </div>
              <Textarea
                placeholder="Share a short bio with the community..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={240}
                rows={3}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full h-12 rounded-full font-semibold"
              loading={loading}
              disabled={!firstName.trim() || firstName.trim().length < 2}
            >
              Continue <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </form>
        )}

        {/* STEP 2: COUNTRY */}
        {currentStep === 'country' && (
          <div className="space-y-4">
            <h2 className="text-par-l font-semibold text-lab-pr">Where are you based?</h2>
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
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-900" />
                Detected automatically from your location. You can choose any country.
              </p>
            )}
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full h-12 rounded-full font-semibold"
                onClick={() => submitStep(false)}
                loading={loading}
              >
                Continue
              </Button>
              <button
                type="button"
                className="w-full py-2.5 text-par-s text-lab-sc hover:text-lab-pr font-medium text-center cursor-pointer transition-colors"
                onClick={() => submitStep(true)}
                disabled={loading}
              >
                Skip step
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CITY */}
        {currentStep === 'city' && (
          <div className="space-y-4">
            <h2 className="text-par-l font-semibold text-lab-pr">Which city?</h2>
            <Input
              label="City"
              placeholder="e.g. Lagos, Abuja, London, New York..."
              value={city}
              onChange={(e) => {
                userEditedCityRef.current = true;
                setCity(e.target.value);
              }}
              maxLength={80}
            />
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full h-12 rounded-full font-semibold"
                onClick={() => submitStep(false)}
                loading={loading}
              >
                Continue
              </Button>
              <button
                type="button"
                className="w-full py-2.5 text-par-s text-lab-sc hover:text-lab-pr font-medium text-center cursor-pointer transition-colors"
                onClick={() => submitStep(true)}
                disabled={loading}
              >
                Skip step
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: USERNAME */}
        {currentStep === 'username' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (usernameAvailable === false || usernameChecking) return;
              submitStep(false);
            }}
            className="space-y-4"
          >
            <div>
              <Input
                label="Choose your @username"
                placeholder="alex_morgan"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                pattern="^[a-zA-Z0-9._]{2,32}$"
                required
                hint="Letters, numbers, dots, and underscores only."
              />
              <div className="mt-2 min-h-5 flex items-center gap-1.5 text-cap-s">
                {usernameChecking ? (
                  <span className="text-lab-sc flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" /> Checking availability...
                  </span>
                ) : usernameAvailable === true ? (
                  <span className="text-green-600 font-semibold flex items-center gap-1.5">
                    <Check className="size-3.5" /> Username is available
                  </span>
                ) : usernameAvailable === false ? (
                  <span className="text-red-600 font-semibold flex items-center gap-1.5">
                    <X className="size-3.5" /> Username is taken or invalid
                  </span>
                ) : null}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full h-12 rounded-full font-semibold"
              loading={loading}
              disabled={usernameAvailable === false || usernameChecking || !username.trim()}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Complete Setup
            </Button>
          </form>
        )}

        {/* Terms agreement matching ColibriPlus index.blade.php */}
        <div className="mt-6 pt-4 border-t border-bord-tr/60 text-center">
          <p className="text-cap-s text-lab-sc">
            By completing setup, you agree to our{' '}
            <Link href="/document/terms-of-use" className="text-brand-900 hover:underline">
              Terms of Use
            </Link>{' '}
            and{' '}
            <Link href="/document/privacy-policy" className="text-brand-900 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
