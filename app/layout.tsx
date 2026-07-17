import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AppProviders } from '@/components/providers/app-providers';

export const metadata: Metadata = {
  title: 'Engagement Ready AI',
  description: 'AI-powered Discovery-to-Delivery Intelligence for IBM Consulting.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
