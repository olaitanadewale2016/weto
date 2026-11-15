import { redirect } from 'next/navigation';

export default async function AdminConfigSubRedirectPage({
  params,
}: {
  params: Promise<{ subsection: string }>;
}) {
  const { subsection } = await params;
  if (subsection.toLowerCase() === 'verification') {
    redirect('/admin?tab=verification');
  }
  redirect('/admin?tab=settings');
}
