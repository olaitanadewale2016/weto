import { notFound, redirect } from 'next/navigation';

const SECTION_TO_TAB: Record<string, string> = {
  overview: 'overview',
  dash: 'overview',
  dashboard: 'overview',
  users: 'users',
  posts: 'posts',
  comments: 'comments',
  stories: 'stories',
  market: 'marketplace',
  marketplace: 'marketplace',
  jobs: 'jobs',
  businesses: 'businesses',
  chats: 'chats',
  ads: 'ads',
  reports: 'reports',
  moderation_history: 'moderation_history',
  banning: 'banning',
  authorship: 'authorship',
  verification: 'verification',
  payments: 'payments',
  cashouts: 'cashouts',
  acquiring: 'acquiring',
  categories: 'categories',
  currency: 'currencies',
  currencies: 'currencies',
  lang: 'locales',
  locales: 'locales',
  pages: 'static_pages',
  static_pages: 'static_pages',
  storage: 'storage',
  config: 'settings',
  settings: 'settings',
  lab: 'lab',
  audit_logs: 'audit_logs',
  api_keys: 'api_keys',
};

export default async function AdminSectionRedirectPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const tab = SECTION_TO_TAB[section.toLowerCase()];
  if (!tab) {
    notFound();
  }
  redirect(`/admin?tab=${tab}`);
}
