import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import AppLayout from './app-layout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AIPS - AI-Powered Store Surveillance System',
  description: 'Advanced AI-powered surveillance system for retail security, customer analytics, and loss prevention.',
  keywords: 'AI, surveillance, retail, security, analytics, computer vision, machine learning',
  authors: [{ name: 'AIPS Team' }],
  viewport: 'width=device-width, initial-scale=1',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased dark-blue`}>
        <AppLayout>
          {children}
        </AppLayout>
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
