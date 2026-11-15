import { Types } from 'mongoose';
import { Bookmark, Post, Reaction } from '@/models/Post';
import { Follow } from '@/models/SocialGraph';
import { FollowStatus, PostStatus, PostType } from '@/types/enums';

export interface ViewerSignalProfile {
  viewerId: string;
  followingSet: Set<string>;
  authorAffinityMap: Map<string, number>;
  interestTags: Set<string>;
  interestTokens: Set<string>;
}

const STOP_WORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'just',
  'your',
  'about',
  'what',
  'when',
  'where',
  'will',
  'they',
  'their',
  'more',
  'than',
  'then',
  'some',
  'here',
  'there',
  'very',
  'been',
  'were',
  'into',
  'also',
  'only',
  'like',
  'make',
  'made',
]);

function extractTopicTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((tok) => tok.length >= 4 && !STOP_WORDS.has(tok));
}

/**
 * Collects the viewer's social graph + historical interaction signals
 * (follows, reactions, bookmarks, hashtags, content topics) for
 * Facebook EdgeRank-style personalization across feed posts and ads.
 */
export async function getViewerSignalProfile(
  viewerId?: string | Types.ObjectId | null
): Promise<ViewerSignalProfile | null> {
  if (!viewerId) return null;
  const uid = new Types.ObjectId(String(viewerId));

  const [followingIds, recentReactions, recentBookmarks] = await Promise.all([
    Follow.find({ followerId: uid, status: FollowStatus.FOLLOWING }).distinct('followingId'),
    Reaction.find({ userId: uid, targetType: 'post' })
      .sort({ createdAt: -1 })
      .limit(40)
      .select('targetId')
      .lean(),
    Bookmark.find({ userId: uid, targetType: 'post' })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('targetId')
      .lean(),
  ]);

  const followingSet = new Set(followingIds.map((id) => String(id)));
  const interactedPostIds = Array.from(
    new Set([
      ...recentReactions.map((r) => String(r.targetId)),
      ...recentBookmarks.map((b) => String(b.targetId)),
    ])
  )
    .filter((id) => Types.ObjectId.isValid(id))
    .slice(0, 60)
    .map((id) => new Types.ObjectId(id));

  const authorAffinityMap = new Map<string, number>();
  const interestTags = new Set<string>();
  const interestTokens = new Set<string>();

  if (interactedPostIds.length > 0) {
    const interactedPosts = await Post.find({ _id: { $in: interactedPostIds } })
      .select('userId hashtags title content')
      .lean();

    for (const p of interactedPosts) {
      const aId = String(p.userId);
      authorAffinityMap.set(aId, (authorAffinityMap.get(aId) || 0) + 1);
      if (Array.isArray(p.hashtags)) {
        for (const tag of p.hashtags) {
          const clean = String(tag).toLowerCase();
          if (clean) {
            interestTags.add(clean);
            interestTokens.add(clean);
          }
        }
      }
      const tokens = extractTopicTokens(`${p.title || ''} ${p.content || ''}`);
      for (const tok of tokens) {
        interestTokens.add(tok);
      }
    }
  }

  return {
    viewerId: String(uid),
    followingSet,
    authorAffinityMap,
    interestTags,
    interestTokens,
  };
}

export interface RankablePost {
  _id: unknown;
  userId?: { _id?: unknown; verified?: boolean; type?: string } | unknown;
  status?: string;
  type?: string;
  hashtags?: string[];
  linkSnapshot?: unknown;
  globalPinned?: boolean;
  commentsCount?: number;
  quotesCount?: number;
  sharesCount?: number;
  repostsCount?: number;
  bookmarksCount?: number;
  viewsCount?: number;
  reactionSummary?: Array<{ count?: number }>;
  createdAt?: Date | string;
}

/**
 * Facebook EdgeRank-inspired ranking algorithm:
 *   Score = Affinity(viewer, author) * Weight(meaningful interactions + media richness + topic match) * Decay(age)
 * Followed by an Author Pacing pass so no single creator dominates back-to-back feed slots.
 */
export function rankPostsFacebookStyle<T extends RankablePost>({
  posts,
  viewerSignals,
  mode,
}: {
  posts: T[];
  viewerSignals: ViewerSignalProfile | null;
  mode: string;
}): T[] {
  const nowMs = Date.now();
  const isTrending = mode === 'trending';
  const gravity = isTrending ? 1.12 : 1.35;

  const scored = posts.map((post) => {
    const authorObj =
      post.userId && typeof post.userId === 'object' && '_id' in post.userId
        ? (post.userId as { _id: unknown; verified?: boolean; type?: string })
        : null;
    const authorId = authorObj ? String(authorObj._id) : String(post.userId || '');

    // Keep own active processing uploads at top of Home
    if (
      viewerSignals &&
      authorId === viewerSignals.viewerId &&
      post.status === PostStatus.PROCESSING_VIDEO
    ) {
      return { post, authorId, score: Number.MAX_SAFE_INTEGER };
    }

    const createdMs = post.createdAt ? new Date(post.createdAt).getTime() : nowMs;
    const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);

    // 1. Meaningful Social Interactions (MSI) edge weight
    const reactionsCount = Array.isArray(post.reactionSummary)
      ? post.reactionSummary.reduce((sum, r) => sum + (r.count || 0), 0)
      : 0;
    const commentsCount = Number(post.commentsCount || 0);
    const sharesAndQuotes =
      Number(post.quotesCount || 0) +
      Number(post.sharesCount || 0) +
      Number(post.repostsCount || 0);
    const bookmarksCount = Number(post.bookmarksCount || 0);
    const viewsCount = Number(post.viewsCount || 0);

    const rawEngagement =
      commentsCount * 6 +
      sharesAndQuotes * 5 +
      bookmarksCount * 4 +
      reactionsCount * 2 +
      Math.log10(viewsCount + 1) * 1.5;

    // Logarithmic dampener keeps one mega-viral post from starving recent friend posts
    const edgeWeight = 3 + Math.log1p(rawEngagement) * (isTrending ? 5.5 : 3.2);

    // 2. Content Format Weight (Facebook favors native video/visuals & rich links)
    let formatMultiplier = 1.0;
    if (post.type === PostType.VIDEO) formatMultiplier = 1.35;
    else if (post.type === PostType.IMAGE || post.type === PostType.GIF || post.type === PostType.POLL)
      formatMultiplier = 1.22;
    else if (post.type === PostType.AUDIO) formatMultiplier = 1.18;
    else if (post.type === PostType.DOCUMENT || post.linkSnapshot) formatMultiplier = 1.15;

    // 3. Affinity + Creator Topic Match
    let affinityMultiplier = 1.0;
    let freshOwnBoost = 0;

    if (viewerSignals) {
      const isSelf = authorId === viewerSignals.viewerId;
      const isFollowing = viewerSignals.followingSet.has(authorId);
      const interactionCount = viewerSignals.authorAffinityMap.get(authorId) || 0;

      if (isSelf) {
        affinityMultiplier = 1.5;
        if (ageHours < 0.5) {
          freshOwnBoost = 40;
        }
      } else if (isFollowing) {
        affinityMultiplier = 1.75 + Math.min(1.0, interactionCount * 0.25);
      } else if (interactionCount > 0) {
        affinityMultiplier = 1.2 + Math.min(0.6, interactionCount * 0.2);
      }

      if (Array.isArray(post.hashtags) && post.hashtags.length > 0) {
        let matchedTags = 0;
        for (const t of post.hashtags) {
          if (viewerSignals.interestTags.has(String(t).toLowerCase())) {
            matchedTags += 1;
          }
        }
        if (matchedTags > 0) {
          affinityMultiplier *= 1 + Math.min(0.7, matchedTags * 0.35);
        }
      }
    }

    if (authorObj?.verified || authorObj?.type === 'author') {
      affinityMultiplier *= 1.12;
    }

    // 4. Time Decay + Early Launchpad Freshness Bonus (< 3 hours)
    const decay = Math.pow(ageHours + 2, gravity);
    const freshnessBonus = !isTrending && ageHours < 3 ? (3 - ageHours) * 2.2 : 0;
    const pinnedBoost = post.globalPinned ? 250 : 0;

    const score =
      pinnedBoost +
      freshOwnBoost +
      freshnessBonus +
      (affinityMultiplier * edgeWeight * formatMultiplier * 10) / decay;

    return { post, authorId, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 5. Author Pacing / Diversity Pass (prevents consecutive creator clustering)
  const authorCounts = new Map<string, number>();
  const diversified = scored.map((entry, idx) => {
    if (entry.post.globalPinned || entry.score >= Number.MAX_SAFE_INTEGER / 2) {
      return { ...entry, adjustedScore: entry.score, originalIdx: idx };
    }
    const seenSoFar = authorCounts.get(entry.authorId) || 0;
    authorCounts.set(entry.authorId, seenSoFar + 1);
    const penalty = Math.pow(0.58, seenSoFar);
    return {
      ...entry,
      adjustedScore: entry.score * penalty,
      originalIdx: idx,
    };
  });

  diversified.sort((a, b) => b.adjustedScore - a.adjustedScore || a.originalIdx - b.originalIdx);
  return diversified.map((item) => item.post);
}

export interface RankableAd {
  _id: unknown;
  title?: string | null;
  content?: string | null;
  pricePerView: number;
  totalBudget: number;
  spentBudget: number;
  viewsCount: number;
  lastShowAt?: Date | null;
}

/**
 * Facebook Ad Auction score:
 *   TotalValue = Bid (pricePerView) * BudgetPacing * EstimatedRelevance(eCTR) * LearningPhaseBoost
 */
export function scoreAdFacebookAuction({
  ad,
  nowMs,
  refreshIntervalMs,
  viewerSignals,
  isExcluded,
}: {
  ad: RankableAd;
  nowMs: number;
  refreshIntervalMs: number;
  viewerSignals: ViewerSignalProfile | null;
  isExcluded: boolean;
}): number {
  const bid = Math.max(0.01, Number(ad.pricePerView || 0.05));
  const totalBudget = Math.max(0.01, Number(ad.totalBudget || 1));
  const remainingRatio = Math.max(0, (totalBudget - Number(ad.spentBudget || 0)) / totalBudget);

  // Even pacing across remaining budget
  const budgetPacing = 0.4 + 0.8 * remainingRatio;

  // Cooldown recovery since lastShowAt
  const lastShowMs = ad.lastShowAt ? new Date(ad.lastShowAt).getTime() : 0;
  const elapsedMs = Math.max(0, nowMs - lastShowMs);
  const cooldownFactor =
    lastShowMs === 0
      ? 1.25
      : elapsedMs >= refreshIntervalMs
        ? Math.min(1.5, 1 + (elapsedMs - refreshIntervalMs) / (refreshIntervalMs * 4))
        : 0.25;

  // Cold-start exploration boost (Facebook learning phase < 10 impressions)
  const learningPhaseBoost = Number(ad.viewsCount || 0) < 10 ? 1.3 : 1.0;

  // Relevance match with viewer interests
  let relevance = 1.0;
  if (viewerSignals && viewerSignals.interestTokens.size > 0) {
    const adTokens = extractTopicTokens(`${ad.title || ''} ${ad.content || ''}`);
    let matches = 0;
    for (const tok of adTokens) {
      if (viewerSignals.interestTokens.has(tok)) matches += 1;
    }
    relevance += Math.min(0.9, matches * 0.3);
  }

  // Frequency cap penalty for ads already rendered in this viewport scroll
  const frequencyPenalty = isExcluded ? 0.05 : 1.0;

  return bid * budgetPacing * cooldownFactor * learningPhaseBoost * relevance * frequencyPenalty;
}
