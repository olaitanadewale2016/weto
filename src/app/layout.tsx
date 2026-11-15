import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { AppProvider } from '@/components/providers/AppContext';

export const metadata: Metadata = {
  title: {
    default: 'Weto — Modern Social Platform',
    template: '%s | Weto',
  },
  description:
    'Connect, publish, trade on the Marketplace, find Jobs, message in real time, and monetize your community.',
  manifest: '/pwa/manifest.json',
  icons: {
    icon: '/assets/logos/favicon.png',
    apple: '/pwa/icons/192x192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg-pr text-lab-pr antialiased font-sans overflow-x-clip">
        <ToastProvider>
          <AppProvider>{children}</AppProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
