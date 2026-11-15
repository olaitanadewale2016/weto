'use client';

import React, { useEffect, useState } from 'react';
import { Monitor, Tablet } from 'lucide-react';
import { useApp } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';

type DeviceViewMode = 'desktop' | 'mobile';
const STORAGE_KEY = 'cp_device_view';
const LG_BREAKPOINT = 1024;

/**
 * Replicates ColibriPlus Source/resources/views/components/device-switcher/{desktop,mobile}.blade.php
 * Shows a fullscreen switch prompt when switching viewport between desktop (>=1024px) and mobile (<1024px).
 */
export function DeviceSwitcherOverlay() {
  const { bootstrap, theme } = useApp();
  const [promptTarget, setPromptTarget] = useState<DeviceViewMode | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getViewportMode = (): DeviceViewMode =>
      window.innerWidth >= LG_BREAKPOINT ? 'desktop' : 'mobile';

    // Initialize preferred mode once per tab/session if unset
    const stored = window.localStorage.getItem(STORAGE_KEY) as DeviceViewMode | null;
    if (!stored) {
      window.localStorage.setItem(STORAGE_KEY, getViewportMode());
    }

    const evaluateViewport = () => {
      const preferred =
        (window.localStorage.getItem(STORAGE_KEY) as DeviceViewMode | null) || getViewportMode();
      const current = getViewportMode();

      if (preferred === 'desktop' && current === 'mobile') {
        setPromptTarget('mobile');
      } else if (preferred === 'mobile' && current === 'desktop') {
        setPromptTarget('desktop');
      } else {
        setPromptTarget(null);
      }
    };

    const rafId = window.requestAnimationFrame(evaluateViewport);
    window.addEventListener('resize', evaluateViewport);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', evaluateViewport);
    };
  }, []);

  if (!promptTarget) return null;

  const isSwitchingToMobile = promptTarget === 'mobile';
  const appName = bootstrap?.config?.appName || 'Weto';
  const logoSrc =
    theme === 'dark'
      ? bootstrap?.config?.logos?.dark || '/assets/logos/dark.png'
      : bootstrap?.config?.logos?.light || '/assets/logos/light.png';

  function handleConfirmSwitch() {
    if (typeof window !== 'undefined' && promptTarget) {
      window.localStorage.setItem(STORAGE_KEY, promptTarget);
    }
    setPromptTarget(null);
  }

  return (
    <div
      className="fixed bg-bg-pr inset-0 overflow-hidden z-[1000]"
      role="dialog"
      aria-modal="true"
      aria-label={isSwitchingToMobile ? 'On mobile device?' : 'On desktop device?'}
    >
      <div className="flex flex-col h-full pt-safe pb-safe px-safe">
        <div className="flex items-center justify-center mb-6 h-14 border-b border-bord-pr shrink-0">
          <div className="w-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={appName} className="w-full" />
          </div>
        </div>

        <div className="flex-1 px-6 text-center mt-12">
          <div className="flex justify-center mb-2">
            <div className="text-lab-pr2">
              {isSwitchingToMobile ? (
                <Tablet className="size-6 stroke-[1.5]" />
              ) : (
                <Monitor className="size-6 stroke-[1.5]" />
              )}
            </div>
          </div>
          <h4 className="text-title-2 text-lab-pr2 font-bold tracking-tighter mb-1">
            {isSwitchingToMobile ? 'On mobile device?' : 'On desktop device?'}
          </h4>
          <p className="text-par-l text-lab-sc mb-4">
            {isSwitchingToMobile
              ? 'If you are on mobile device, continue by clicking the button below.'
              : 'If you are on desktop device, continue by clicking the button below.'}
          </p>
        </div>

        <div className="px-6 pb-6">
          <div className="max-w-[400px] mx-auto">
            <Button
              variant="primary"
              className="w-full h-12 px-5 text-par-n"
              onClick={handleConfirmSwitch}
            >
              {isSwitchingToMobile ? 'Switch to Mobile' : 'Switch to Desktop'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
