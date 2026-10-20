import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'kdan-social', robots: { index: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F4F5F7', color: '#17191C' }}>{children}</body>
    </html>
  );
}
