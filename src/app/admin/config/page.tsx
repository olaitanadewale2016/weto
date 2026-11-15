import { redirect } from 'next/navigation';

export default function AdminConfigIndexRedirectPage() {
  redirect('/admin?tab=settings');
}
