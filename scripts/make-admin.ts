import './load-env';
import { connectDB } from '../src/lib/db';
import { User } from '../src/models';
import { UserRole, UserStatus } from '../src/types/enums';

/**
 * Port of ColibriPlus PHP `php artisan admin:root` (AddAdmin.php).
 * Usage: npm run admin:root -- <email-or-username>
 */
async function main() {
  const identifier = (process.argv[2] || '').trim().replace(/^@/, '').toLowerCase();

  if (!identifier) {
    console.error('Usage: npm run admin:root -- <email-or-username>');
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  });

  if (!user) {
    console.error(`User not found for "${identifier}". Sign up first at /auth/signup.`);
    process.exit(1);
  }

  user.role = UserRole.ROOT;
  if (user.status === UserStatus.ONBOARDING) {
    user.status = UserStatus.ACTIVE;
  }
  await user.save();

  console.log(`Admin (Root) role assigned successfully to @${user.username} (${user.email}).`);
  console.log('Sign in at /auth/login and open /admin to access the Admin Control Panel.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to assign root admin:', err);
  process.exit(1);
});
