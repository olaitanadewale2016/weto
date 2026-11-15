import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'public', 'assets', 'seed');

const AVATAR_PROFILES = [
  { username: 'tunde_yaba', initials: 'TA', bg1: '#0f172a', bg2: '#1e293b', accent: '#38bdf8' },
  { username: 'amaka_creative', initials: 'AO', bg1: '#27272a', bg2: '#3f3f46', accent: '#f59e0b' },
  { username: 'ibrahim_abuja', initials: 'IB', bg1: '#064e3b', bg2: '#065f46', accent: '#34d399' },
  { username: 'chidi_gadgetshub', initials: 'CN', bg1: '#172554', bg2: '#1e3a8a', accent: '#60a5fa' },
  { username: 'kemi_adire', initials: 'KO', bg1: '#1e1b4b', bg2: '#312e81', accent: '#818cf8' },
  { username: 'zainab_kano', initials: 'ZM', bg1: '#451a03', bg2: '#78350f', accent: '#fbbf24' },
  { username: 'efe_ph', initials: 'EO', bg1: '#134e4a', bg2: '#115e59', accent: '#2dd4bf' },
  { username: 'nneka_hr', initials: 'NE', bg1: '#3b0764', bg2: '#581c87', accent: '#c084fc' },
];

const COVER_MAPPINGS: Array<{ username: string; source: string }> = [
  { username: 'tunde_yaba', source: 'posts/yaba-fintech-hub.jpg' },
  { username: 'amaka_creative', source: 'products/fintech-ui-kit.jpg' },
  { username: 'ibrahim_abuja', source: 'posts/abuja-cloud-meetup.jpg' },
  { username: 'chidi_gadgetshub', source: 'products/ecoflow-solar.jpg' },
  { username: 'kemi_adire', source: 'posts/ibadan-adire-pit.jpg' },
  { username: 'zainab_kano', source: 'products/kilishi-zobo-box.jpg' },
  { username: 'efe_ph', source: 'products/starlink-kit.jpg' },
  { username: 'nneka_hr', source: 'products/macbook-pro-m3.jpg' },
];

async function ensureDirs() {
  for (const sub of ['avatars', 'covers', 'posts', 'products', 'videos', 'ads', 'stories']) {
    fs.mkdirSync(path.join(SEED_DIR, sub), { recursive: true });
  }
}

async function generateAvatars() {
  for (const p of AVATAR_PROFILES) {
    const out = path.join(SEED_DIR, 'avatars', `${p.username}.png`);
    const svg = `
      <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${p.bg1}"/>
            <stop offset="100%" stop-color="${p.bg2}"/>
          </linearGradient>
        </defs>
        <rect width="400" height="400" fill="url(#g)"/>
        <circle cx="320" cy="80" r="90" fill="${p.accent}" fill-opacity="0.18"/>
        <circle cx="80" cy="340" r="110" fill="${p.accent}" fill-opacity="0.12"/>
        <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="144" font-weight="700"
          fill="#ffffff" letter-spacing="-4">${p.initials}</text>
      </svg>
    `;
    await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(out);
  }
}

async function generateCovers() {
  for (const c of COVER_MAPPINGS) {
    const src = path.join(SEED_DIR, c.source);
    const out = path.join(SEED_DIR, 'covers', `${c.username}.jpg`);
    if (fs.existsSync(src)) {
      await sharp(src)
        .resize(1200, 400, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 84 })
        .toFile(out);
    }
  }
}

async function generateAdCreative() {
  const src = path.join(SEED_DIR, 'products', 'ecoflow-solar.jpg');
  const out = path.join(SEED_DIR, 'ads', 'ecoflow-promo.jpg');
  if (fs.existsSync(src)) {
    await sharp(src)
      .resize(1200, 628, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 86 })
      .toFile(out);
  }
}

async function generateVideos() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.warn('ffmpeg-static not found; skipping video generation');
    return;
  }

  // 1) Landscape 720p Post Video (5s pan/zoom of Yaba Fintech Studio)
  const postImg = path.join(SEED_DIR, 'posts', 'yaba-fintech-hub.jpg');
  const postVideo = path.join(SEED_DIR, 'videos', 'yaba-fintech-tour.mp4');
  const postPoster = path.join(SEED_DIR, 'videos', 'yaba-fintech-tour.jpg');
  if (fs.existsSync(postImg)) {
    await sharp(postImg).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(postPoster);
    execFileSync(
      ffmpegPath,
      [
        '-y',
        '-loop',
        '1',
        '-i',
        postImg,
        '-vf',
        "scale=1600:-1,zoompan=z='min(zoom+0.0018,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=1280x720:fps=25",
        '-t',
        '5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        postVideo,
      ],
      { stdio: 'pipe' }
    );
  }

  // 2) Vertical 720x1280 Story Video (4s pan/zoom of Ibadan Adire Courtyard)
  const storyImg = path.join(SEED_DIR, 'posts', 'ibadan-adire-pit.jpg');
  const storyVideo = path.join(SEED_DIR, 'videos', 'adire-craft-story.mp4');
  const storyPoster = path.join(SEED_DIR, 'videos', 'adire-craft-story.jpg');
  if (fs.existsSync(storyImg)) {
    await sharp(storyImg).resize(720, 1280, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(storyPoster);
    execFileSync(
      ffmpegPath,
      [
        '-y',
        '-loop',
        '1',
        '-i',
        storyImg,
        '-vf',
        "scale=960:-1,zoompan=z='min(zoom+0.002,1.22)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=100:s=720x1280:fps=25",
        '-t',
        '4',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        storyVideo,
      ],
      { stdio: 'pipe' }
    );
  }
}

async function main() {
  await ensureDirs();
  await generateAvatars();
  await generateCovers();
  await generateAdCreative();
  await generateVideos();
  console.log('Seed media assets generated cleanly in public/assets/seed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
