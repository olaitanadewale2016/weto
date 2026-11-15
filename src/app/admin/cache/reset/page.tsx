import { redirect } from 'next/navigation';

export default function AdminCacheResetRedirectPage() {
  redirect('/admin?tab=lab');
}
