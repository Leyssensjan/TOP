import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'FlowQuest',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'FlowQuest' },
};

export const viewport: Viewport = {
  themeColor: '#0e1621',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
