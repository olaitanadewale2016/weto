import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  applyImageWatermarkBuffer,
  clearWatermarkCache,
  resolveWatermarkBuffer,
  scaleStoryImageTo1080x1920,
  shouldWatermarkImage,
  shouldWatermarkVideo,
  WATERMARK_CONFIG,
} from '@/services/media.service';
import { DEFAULT_SETTINGS } from '@/services/settings.service';
import { MediaType } from '@/types/enums';

describe('PHP ColibriPlus Watermark Parity', () => {
  it('matches PHP config/assets.php and BrandSettings migration defaults', () => {
    expect(WATERMARK_CONFIG).toEqual({
      localPath: 'assets/watermarks/default.png',
      video: {
        position: 'absolute',
        y: 30,
        x: 30,
      },
      image: {
        position: 'bottom-right',
        padding: 30,
      },
    });

    expect(DEFAULT_SETTINGS.brand.imagesWatermarkEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.brand.videosWatermarkEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.brand.watermarkUrl).toBe('/assets/watermarks/default.png');
  });

  it('watermarks only PHP-designated image target types (post, story_frame, message, product)', () => {
    expect(shouldWatermarkImage({ targetType: 'post', mimeType: 'image/jpeg' })).toBe(true);
    expect(shouldWatermarkImage({ targetType: 'story_frame', mimeType: 'image/webp' })).toBe(true);
    expect(shouldWatermarkImage({ targetType: 'message', mimeType: 'image/png' })).toBe(true);
    expect(shouldWatermarkImage({ targetType: 'product', mimeType: 'image/jpeg' })).toBe(true);

    // Excluded target types & formats in PHP ImageUploadService callers
    expect(shouldWatermarkImage({ targetType: 'user_avatar', mimeType: 'image/png' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'user_cover', mimeType: 'image/jpeg' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'business_logo', mimeType: 'image/png' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'business_cover', mimeType: 'image/jpeg' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'ad', mimeType: 'image/jpeg' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'system_asset', mimeType: 'image/png' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'post', mimeType: 'image/gif' })).toBe(false);
    expect(shouldWatermarkImage({ targetType: 'post', mimeType: 'image/svg+xml' })).toBe(false);
  });

  it('watermarks PHP-designated video targets (post, story_frame) and excludes ad/video_circle', () => {
    expect(shouldWatermarkVideo({ targetType: 'post', mediaType: MediaType.VIDEO })).toBe(true);
    expect(shouldWatermarkVideo({ targetType: 'story_frame', mediaType: MediaType.VIDEO })).toBe(true);
    expect(shouldWatermarkVideo({ targetType: 'ad', mediaType: MediaType.VIDEO })).toBe(false);
    expect(shouldWatermarkVideo({ targetType: 'message', mediaType: MediaType.VIDEO_CIRCLE })).toBe(false);
  });

  it('composites the watermark at bottom-right with 30px padding onto uploaded images', async () => {
    clearWatermarkCache();
    const defaultWm = await resolveWatermarkBuffer('/assets/watermarks/default.png');
    expect(defaultWm).not.toBeNull();
    expect(defaultWm!.length).toBeGreaterThan(100);

    // Create a solid blue 400x300 PNG canvas and a solid white 64x64 watermark
    const baseImage = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r: 20, g: 40, b: 120, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const whiteWatermark = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const watermarked = await applyImageWatermarkBuffer(baseImage, 'image/png', whiteWatermark);
    const meta = await sharp(watermarked).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);

    // Top-left (30, 30) should still be original blue (20, 40, 120)
    const topLeftPatch = await sharp(watermarked)
      .extract({ left: 30, top: 30, width: 10, height: 10 })
      .raw()
      .toBuffer();
    expect(topLeftPatch[0]).toBe(20);
    expect(topLeftPatch[1]).toBe(40);
    expect(topLeftPatch[2]).toBe(120);

    // Bottom-right watermark area: left = 400 - 64 - 30 = 306, top = 300 - 64 - 30 = 206
    const bottomRightPatch = await sharp(watermarked)
      .extract({ left: 320, top: 220, width: 10, height: 10 })
      .raw()
      .toBuffer();
    expect(bottomRightPatch[0]).toBe(255);
    expect(bottomRightPatch[1]).toBe(255);
    expect(bottomRightPatch[2]).toBe(255);

    // Margin area right of watermark (left = 385, top = 285 -> inside the 30px padding) should remain blue
    const marginPatch = await sharp(watermarked)
      .extract({ left: 385, top: 285, width: 5, height: 5 })
      .raw()
      .toBuffer();
    expect(marginPatch[0]).toBe(20);
    expect(marginPatch[1]).toBe(40);
    expect(marginPatch[2]).toBe(120);
  });

  it('scales story images onto a 1080x1920 black canvas matching PHP scaleTo1080x1920()', async () => {
    const rawStory = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const scaled = await scaleStoryImageTo1080x1920(rawStory, 'image/jpeg');
    const meta = await sharp(scaled).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });
});
