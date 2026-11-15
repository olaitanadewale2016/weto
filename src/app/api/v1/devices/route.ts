import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { Device } from '@/models/Device';
import crypto from 'crypto';

const fcmSchema = z.object({
  fcmToken: z.string().min(10),
  deviceHash: z.string().optional(),
  enabled: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = fcmSchema.parse(await req.json());
    const ua = req.headers.get('user-agent') || 'Unknown';
    const deviceHash =
      body.deviceHash || crypto.createHash('sha256').update(`${user._id}:${ua}`).digest('hex').slice(0, 32);

    await Device.updateOne(
      { userId: user._id, deviceHash },
      {
        $set: {
          fcmToken: body.fcmToken,
          pushEnabled: body.enabled,
          lastOnline: new Date(),
        },
      },
      { upsert: true }
    );

    return apiSuccess({ registered: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const devices = await Device.find({ userId: user._id, isTerminated: false })
      .sort({ lastOnline: -1 })
      .lean();
    return apiSuccess(devices);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { keepDeviceHash?: string };
    await Device.updateMany(
      {
        userId: user._id,
        ...(body.keepDeviceHash ? { deviceHash: { $ne: body.keepDeviceHash } } : {}),
      },
      { $set: { isTerminated: true, fcmToken: null, pushEnabled: false } }
    );
    return apiSuccess({ terminated: true });
  } catch (err) {
    return apiError(err);
  }
}
