/**
 * Curated preset profile avatars ported from Grupo Pro (`assets/files/avatars/`).
 * All files are served locally from `public/assets/avatars/presets/`.
 */
export interface PresetAvatarItem {
  id: string;
  label: string;
  url: string;
}

export const PRESET_AVATARS: PresetAvatarItem[] = [
  { id: 'avatar-4yKopU', label: 'Avatar 1', url: '/assets/avatars/presets/avatar-4yKopU.png' },
  { id: 'avatar-8yi3KQ', label: 'Avatar 2', url: '/assets/avatars/presets/avatar-8yi3KQ.png' },
  { id: 'avatar-9aSEvy', label: 'Avatar 3', url: '/assets/avatars/presets/avatar-9aSEvy.png' },
  { id: 'avatar-az2hTG', label: 'Avatar 4', url: '/assets/avatars/presets/avatar-az2hTG.png' },
  { id: 'avatar-dNP2kJ', label: 'Avatar 5', url: '/assets/avatars/presets/avatar-dNP2kJ.png' },
  { id: 'avatar-eTjc37', label: 'Avatar 6', url: '/assets/avatars/presets/avatar-eTjc37.png' },
  { id: 'avatar-gH64GC', label: 'Avatar 7', url: '/assets/avatars/presets/avatar-gH64GC.png' },
  { id: 'avatar-GW9vkw', label: 'Avatar 8', url: '/assets/avatars/presets/avatar-GW9vkw.png' },
  { id: 'avatar-h2mjRO', label: 'Avatar 9', url: '/assets/avatars/presets/avatar-h2mjRO.png' },
  { id: 'avatar-hOtRw2', label: 'Avatar 10', url: '/assets/avatars/presets/avatar-hOtRw2.png' },
  { id: 'avatar-iZFXzB', label: 'Avatar 11', url: '/assets/avatars/presets/avatar-iZFXzB.png' },
  { id: 'avatar-NBYReK', label: 'Avatar 12', url: '/assets/avatars/presets/avatar-NBYReK.png' },
  { id: 'avatar-PpC0tx', label: 'Avatar 13', url: '/assets/avatars/presets/avatar-PpC0tx.png' },
  { id: 'avatar-pw53my', label: 'Avatar 14', url: '/assets/avatars/presets/avatar-pw53my.png' },
  { id: 'avatar-qDKFuv', label: 'Avatar 15', url: '/assets/avatars/presets/avatar-qDKFuv.png' },
  { id: 'avatar-Rkf0us', label: 'Avatar 16', url: '/assets/avatars/presets/avatar-Rkf0us.png' },
  { id: 'avatar-SkfDdz', label: 'Avatar 17', url: '/assets/avatars/presets/avatar-SkfDdz.png' },
  { id: 'avatar-VufCSG', label: 'Avatar 18', url: '/assets/avatars/presets/avatar-VufCSG.png' },
  { id: 'avatar-xyoenE', label: 'Avatar 19', url: '/assets/avatars/presets/avatar-xyoenE.png' },
  { id: 'avatar-Y8hidn', label: 'Avatar 20', url: '/assets/avatars/presets/avatar-Y8hidn.png' },
];

const PRESET_AVATAR_SET = new Set(PRESET_AVATARS.map((item) => item.url));

export function isPresetAvatarUrl(url?: string | null): boolean {
  if (!url) return false;
  return PRESET_AVATAR_SET.has(url.trim());
}
