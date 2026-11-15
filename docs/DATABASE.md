# MongoDB Schema & Index Architecture

All Mongoose models reside in `src/models/` and are re-exported from `src/models/index.ts`.

| File | Collections | Key Indexes |
| --- | --- | --- |
| `User.ts` | `users` | `username` (unique), `email`, `firebaseUid` (sparse unique), `ownerAccountId` |
| `Device.ts` | `devices` | `userId`, `fcmToken` (unique) |
| `Post.ts` | `posts`, `comments`, `reactions`, `bookmarks`, `pins` | `hashId` (unique), `hashtags`, `userId + createdAt` |
| `Story.ts` | `story_frames`, `story_views` | `expiresAt`, `storyUuid`, `storyFrameId + userId` (unique) |
| `Messaging.ts` | `chats`, `messages`, `chat_invites` | `chatUuid` (unique), `participants.userId`, `chatId + createdAt` |
| `Commerce.ts` | `business_accounts`, `stores`, `categories`, `products`, `job_listings`, `job_applications` | `hashId`, `categoryId`, `jobId + applicantId` |
| `Finance.ts` | `wallets`, `wallet_transactions`, `payments`, `cashouts`, `ads`, `audit_logs` | `userId`, `idempotencyKey` (sparse unique), `paymentUuid` |
| `Moderation.ts` | `reports`, `moderation_actions`, `censors`, `blacklists` | `status`, `blacklistable`, `word` |
| `System.ts` | `settings`, `currencies`, `locales`, `api_keys`, `static_pages` | `group + key` (unique), `keyHash` (unique), `slug` (unique) |
| `Media.ts` | `media`, `data_stats` | `targetType + targetId + order`, `r2Key`, `mediaType + storageProvider` |
