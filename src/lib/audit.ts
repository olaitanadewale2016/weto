import { Types } from 'mongoose';
import { AuditLog } from '@/models/Finance';
import { logger } from './logger';

export async function writeAuditLog(params: {
  actorId?: Types.ObjectId | string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await AuditLog.create({
      actorId: params.actorId ? new Types.ObjectId(String(params.actorId)) : undefined,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    logger.error({ err, action: params.action }, 'Failed to write audit log');
  }
}
