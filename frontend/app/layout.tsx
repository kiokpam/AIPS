import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import AppLayout from './app-layout';
import { I18nProvider } from '@/src/contexts/I18nContext';
import { AuthProvider } from '@/src/contexts/AuthContext';
import { DataProvider } from '@/src/contexts/DataContext';

// Get base URL from environment or use default
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'AIPS - AI-Powered Store Surveillance System',
  description: 'Advanced AI-powered surveillance system for retail security, customer analytics, and loss prevention.',
  keywords: 'AI, surveillance, retail, security, analytics, computer vision, machine learning',
  authors: [{ name: 'AIPS Team' }],
  robots: 'index, follow',
  openGraph: {
    title: 'AIPS - AI-Powered Store Surveillance System',
    description: 'Advanced AI-powered surveillance system for retail security and analytics',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AIPS - AI-Powered Store Surveillance System',
    description: 'Advanced AI-powered surveillance system for retail security and analytics',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased dark-blue">
        <I18nProvider>
          <AuthProvider>
            <DataProvider>
              <AppLayout>
                {children}
              </AppLayout>
            </DataProvider>
          </AuthProvider>
        </I18nProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
