/**
 * Sticker packs & categorized emoji picker catalog ported from Grupo Pro (`assets/files/stickers/` & `emojis/`).
 */
export interface StickerPack {
  id: string;
  name: string;
  iconUrl: string;
  stickers: string[];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'Famous',
    name: 'Famous',
    iconUrl: '/assets/stickers/Famous/sticker_pack_icon.png',
    stickers: [
      '/assets/stickers/Famous/sticker-1uVb2a.png',
      '/assets/stickers/Famous/sticker-4OQlBp.png',
      '/assets/stickers/Famous/sticker-AbRYJc.png',
      '/assets/stickers/Famous/sticker-b3tUWK.png',
      '/assets/stickers/Famous/sticker-DuV97k.png',
      '/assets/stickers/Famous/sticker-gAh3IF.png',
      '/assets/stickers/Famous/sticker-gHqzBr.png',
      '/assets/stickers/Famous/sticker-iNUHLC.png',
      '/assets/stickers/Famous/sticker-IUpW9v.png',
      '/assets/stickers/Famous/sticker-lbIcMJ.png',
      '/assets/stickers/Famous/sticker-M2eESJ.png',
      '/assets/stickers/Famous/sticker-mEVwQp.png',
      '/assets/stickers/Famous/sticker-MJqc6Z.png',
      '/assets/stickers/Famous/sticker-Mrv9Tp.png',
      '/assets/stickers/Famous/sticker-mX1ClG.png',
      '/assets/stickers/Famous/sticker-MxFPgp.png',
      '/assets/stickers/Famous/sticker-O9tGpK.png',
      '/assets/stickers/Famous/sticker-Ohd2PN.png',
      '/assets/stickers/Famous/sticker-OIybEW.png',
      '/assets/stickers/Famous/sticker-Q8afWH.png',
      '/assets/stickers/Famous/sticker-R4IMwC.png',
      '/assets/stickers/Famous/sticker-rPpvhn.png',
      '/assets/stickers/Famous/sticker-tguvL7.png',
      '/assets/stickers/Famous/sticker-uXZtj1.png',
      '/assets/stickers/Famous/sticker-xF0kgd.png',
      '/assets/stickers/Famous/sticker-YLrp8m.png',
      '/assets/stickers/Famous/sticker-yNYkHa.png',
      '/assets/stickers/Famous/sticker-YosD7B.png',
      '/assets/stickers/Famous/sticker-ZgxydK.png',
      '/assets/stickers/Famous/sticker-ZQ2gWc.png',
    ],
  },
  {
    id: 'Simpsons',
    name: 'Simpsons',
    iconUrl: '/assets/stickers/Simpsons/sticker_pack_icon.png',
    stickers: [
      '/assets/stickers/Simpsons/sticker-1sb0s0.png',
      '/assets/stickers/Simpsons/sticker-2xe7vj.png',
      '/assets/stickers/Simpsons/sticker-4qlohh.png',
      '/assets/stickers/Simpsons/sticker-5ymjzd.png',
      '/assets/stickers/Simpsons/sticker-92f1gm.png',
      '/assets/stickers/Simpsons/sticker-cpflnr.png',
      '/assets/stickers/Simpsons/sticker-h05gsg.png',
      '/assets/stickers/Simpsons/sticker-hgp8pw.png',
      '/assets/stickers/Simpsons/sticker-hnc3p4.png',
      '/assets/stickers/Simpsons/sticker-htayht.png',
      '/assets/stickers/Simpsons/sticker-hzurg3.png',
      '/assets/stickers/Simpsons/sticker-kspuip.png',
      '/assets/stickers/Simpsons/sticker-ksv6h7.png',
      '/assets/stickers/Simpsons/sticker-lqyag4.png',
      '/assets/stickers/Simpsons/sticker-lyu6as.png',
      '/assets/stickers/Simpsons/sticker-m2oqtf.png',
      '/assets/stickers/Simpsons/sticker-mgwrh1.png',
      '/assets/stickers/Simpsons/sticker-mjhkkr.png',
      '/assets/stickers/Simpsons/sticker-p5oh3u.png',
      '/assets/stickers/Simpsons/sticker-pg1jic.png',
      '/assets/stickers/Simpsons/sticker-uejbj4.png',
      '/assets/stickers/Simpsons/sticker-uqaykx.png',
      '/assets/stickers/Simpsons/sticker-wj9g0w.png',
      '/assets/stickers/Simpsons/sticker-xgzr1z.png',
    ],
  },
  {
    id: 'Covid-19',
    name: 'Masks & Care',
    iconUrl: '/assets/stickers/Covid-19/sticker_pack_icon.png',
    stickers: [
      '/assets/stickers/Covid-19/sticker-0cokhe.png',
      '/assets/stickers/Covid-19/sticker-0lfeo6.png',
      '/assets/stickers/Covid-19/sticker-0qoudd.png',
      '/assets/stickers/Covid-19/sticker-4xuitk.png',
      '/assets/stickers/Covid-19/sticker-a6m4u2.png',
      '/assets/stickers/Covid-19/sticker-cmkzjx.png',
      '/assets/stickers/Covid-19/sticker-coz5rb.png',
      '/assets/stickers/Covid-19/sticker-dqmi3g.png',
      '/assets/stickers/Covid-19/sticker-h0w4li.png',
      '/assets/stickers/Covid-19/sticker-hi83ae.png',
      '/assets/stickers/Covid-19/sticker-hwcode.png',
      '/assets/stickers/Covid-19/sticker-imk9br.png',
      '/assets/stickers/Covid-19/sticker-io3zwz.png',
      '/assets/stickers/Covid-19/sticker-iorjzv.png',
      '/assets/stickers/Covid-19/sticker-kirihc.png',
      '/assets/stickers/Covid-19/sticker-m5fgdm.png',
      '/assets/stickers/Covid-19/sticker-mbzeqi.png',
      '/assets/stickers/Covid-19/sticker-pvg87h.png',
      '/assets/stickers/Covid-19/sticker-r1ouoy.png',
      '/assets/stickers/Covid-19/sticker-rouieg.png',
      '/assets/stickers/Covid-19/sticker-viub4u.png',
      '/assets/stickers/Covid-19/sticker-xaojka.png',
      '/assets/stickers/Covid-19/sticker-xsfhyg.png',
    ],
  },
];

const ALL_STICKERS = new Set(STICKER_PACKS.flatMap((pack) => pack.stickers));

export function isValidStickerUrl(url?: string | null): boolean {
  if (!url) return false;
  return ALL_STICKERS.has(url.trim());
}

export interface EmojiGroup {
  id: string;
  label: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇',
      '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😌', '😔', '😴',
      '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥳', '😎', '🤓', '🧐',
      '😕', '😟', '😮', '😯', '😲', '😳', '🥺', '😦', '😢', '😭', '😤', '😡',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
      '👇', '☝️', '👋', '🤚', '🖐️', '✋', '👏', '🙌', '👐', '🤝', '🙏', '✍️',
      '💪', '🦾', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔',
      '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✨', '🔥', '💯', '🎉',
    ],
  },
  {
    id: 'objects',
    label: 'Calls & Media',
    emojis: [
      '📞', '📱', '💻', '🖥️', '🎥', '📹', '🎙️', '🎧', '🔊', '📍', '📌', '📊',
      '🎮', '🏆', '🥇', '⚽', '🏀', '🎵', '🎶', '🚀', '⚡', '🌟', '☀️', '🌙',
      '🌈', '☕', '🍕', '🍔', '🍿', '🎂', '🥂', '💐', '🎁', '✅', '❌', '⚠️',
    ],
  },
];
