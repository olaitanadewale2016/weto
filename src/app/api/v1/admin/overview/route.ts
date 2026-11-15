import { NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { User } from '@/models/User';
import { Post } from '@/models/Post';
import { StoryFrame } from '@/models/Story';
import { BusinessAccount, JobListing, Product } from '@/models/Commerce';
import { Ad, Cashout, Payment } from '@/models/Finance';
import { Report } from '@/models/Moderation';
import { DataStat } from '@/models/Media';
import { Chat } from '@/models/Messaging';
import { AuthorshipRequest } from '@/models/SocialGraph';
import { ASRStatus, CashoutStatus, PaymentStatus, ReportStatus } from '@/types/enums';
import { getSettingsGroup } from '@/services/settings.service';

export async function GET(req: NextRequest) {
  try {
    await requireAdminAuth(req);
    const appSettings = await getSettingsGroup('app');

    const [
      usersCount,
      postsCount,
      storiesCount,
      productsCount,
      jobsCount,
      businessesCount,
      chatsCount,
      adsCount,
      pendingReports,
      pendingCashouts,
      pendingAuthorship,
      completedPaymentsAgg,
      storageStats,
      recentUsers,
      recentPayments,
    ] = await Promise.all([
      User.countDocuments({ deletedAt: null }),
      Post.countDocuments({}),
      StoryFrame.countDocuments({}),
      Product.countDocuments({}),
      JobListing.countDocuments({}),
      BusinessAccount.countDocuments({}),
      Chat.countDocuments({}),
      Ad.countDocuments({}),
      Report.countDocuments({ status: ReportStatus.PENDING }),
      Cashout.countDocuments({ status: CashoutStatus.PENDING }),
      AuthorshipRequest.countDocuments({ status: ASRStatus.PENDING }),
      Payment.aggregate([
        { $match: { status: PaymentStatus.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      DataStat.find({}).lean(),
      User.find({ deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(8)
        .select('username firstName lastName email avatar role status type verified createdAt')
        .lean(),
      Payment.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('userId', 'username email')
        .lean(),
    ]);

    const totalRevenue = Number(completedPaymentsAgg[0]?.total || 0);
    const totalStorageBytes = storageStats.reduce((s, x) => s + (x.contentSizeBytes || 0), 0);

    return apiSuccess({
      defaultCurrency: String(appSettings.defaultCurrency || 'NGN'),
      metrics: {
        usersCount,
        postsCount,
        storiesCount,
        productsCount,
        jobsCount,
        businessesCount,
        chatsCount,
        adsCount,
        pendingReports,
        pendingCashouts,
        pendingAuthorship,
        totalRevenue,
        totalStorageBytes,
      },
      storageStats,
      recentUsers,
      recentPayments,
    });
  } catch (err) {
    return apiError(err);
  }
}
