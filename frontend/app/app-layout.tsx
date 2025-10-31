'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Shield,
  LogOut,
  Bell,
  User,
  ChevronDown,
  Camera,
  BarChart3,
  Settings,
  Menu,
  X
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { I18nProvider, useI18n } from '@/src/contexts/I18nContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  {
    name: 'Cameras',
    href: '/cameras',
    icon: Camera,
    current: false
  },
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: BarChart3,
    current: false
  },
  
];

function InnerLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { lang, setLanguage } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  // Header shrink on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Force default dark theme once
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const body = document.body;
      if (!body.classList.contains('dark-blue')) body.classList.add('dark-blue');
    }
  }, []);

  // Check authentication on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        // For development, set a mock token
        localStorage.setItem('auth_token', 'demo_token');
        localStorage.setItem('user_email', 'admin@aips.com');
      }
    }
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_email');
    }
    toast.success('Logged out successfully');
    router.push('/');
  };

  const setLanguageLocal = (l: 'en' | 'vi') => setLanguage(l);

  const getUserEmail = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_email') || 'admin@aips.com';
    }
    return 'admin@aips.com';
  };

  // Don't show layout for login and home pages
  if (pathname === '/' || pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'radial-gradient(1200px 800px at 10% -10%, #0a1020 0%, #0b1220 40%), linear-gradient(180deg, #0b1220 0%, #0a0f1d 100%)' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? '256px' : '0px',
        backgroundColor: '#0f172a',
        borderRight: '1px solid #1f2937',
        boxShadow: '0 12px 30px rgba(2,6,23,.45)',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Sidebar Header */}
        <div style={{
          height: '64px',
          padding: '0 24px',
          borderBottom: '1px solid #1f2937',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/logo.svg" alt="AIPS" style={{ width: '32px', height: '32px', marginRight: '12px' }} />
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#e5e7eb' }}>AIPS</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0b1325';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '24px 16px' }}>
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: isActive ? '#60a5fa' : '#94a3b8',
                  backgroundColor: isActive ? '#0b1325' : 'transparent',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#0b1325';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <item.icon style={{ width: '20px', height: '20px', marginRight: '12px' }} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info in sidebar */}
        <div style={{ padding: '16px', borderTop: '1px solid #1f2937' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: '#0b1325'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: '#dbeafe',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <User style={{ width: '16px', height: '16px', color: '#1d4ed8' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#e5e7eb',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {getUserEmail()}
              </p>
              <p style={{
                fontSize: '12px',
                color: '#94a3b8',
                margin: 0
              }}>
                Administrator
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top navigation header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          backgroundColor: 'rgba(15,23,42,' + (scrolled ? 0.9 : 0.7) + ')',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid #1f2937',
          height: scrolled ? '56px' : '64px',
          transition: 'height .2s ease, background-color .2s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', boxShadow: '0 12px 30px rgba(2,6,23,.45)'
        }}>
        {/* Menu button and page title */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0b1325';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Menu style={{ width: '20px', height: '20px', color: '#94a3b8' }} />
          </button>
          <h1 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#e5e7eb',
            margin: 0
          }}>
            {navigation.find(item => item.href === pathname)?.name || 'AIPS'}
          </h1>
        </div>

        {/* Right side - language, theme, notifications and user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Language toggle (VI / EN) with underline like Sirix */}
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }} onClick={() => setLanguageLocal('vi')}>
              <span style={{ fontWeight: 600, fontSize: '12px', color: '#e2e8f0' }}>VI</span>
              <div style={{ height: '3px', width: '44px', backgroundColor: '#ffffff', marginTop: '6px', opacity: lang === 'vi' ? 1 : 0, transition: 'opacity .2s' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }} onClick={() => setLanguageLocal('en')}>
              <span style={{ fontWeight: 600, fontSize: '12px', color: '#e2e8f0' }}>EN</span>
              <div style={{ height: '3px', width: '44px', backgroundColor: '#ffffff', marginTop: '6px', opacity: lang === 'en' ? 1 : 0, transition: 'opacity .2s' }} />
            </div>
          </div>

          {/* Theme toggle removed per request */}
          {/* Notifications */}
          <button style={{
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#0b1325';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          >
            <Bell style={{ width: '20px', height: '20px', color: '#94a3b8' }} />
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              backgroundColor: '#ef4444',
              borderRadius: '50%'
            }}></span>
          </button>

          {/* User menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                backgroundColor: '#0b1325',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <User style={{ width: '16px', height: '16px', color: '#60a5fa' }} />
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#e5e7eb'
              }}>
                {getUserEmail()}
              </span>
              <ChevronDown style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '8px',
                width: '200px',
                backgroundColor: '#0f172a',
                borderRadius: '8px',
                boxShadow: '0 12px 30px rgba(2,6,23,.45)',
                border: '1px solid #1f2937',
                zIndex: 50
              }}>
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid #1f2937'
                }}>
                  <p style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#e5e7eb',
                    margin: 0
                  }}>
                    {getUserEmail()}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    margin: 0
                  }}>
                    Administrator
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 16px',
                    textDecoration: 'none',
                    color: '#94a3b8',
                    fontSize: '14px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0b1325';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <LogOut style={{ width: '16px', height: '16px', marginRight: '12px' }} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

        {/* Page content */}
        <main style={{ padding: '24px', color: '#e5e7eb' }}>
          {children}
        </main>
      </div>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40
          }}
          onClick={() => { setUserMenuOpen(false); }}
        />
      )}
    </div>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <I18nProvider>
      <InnerLayout>{children}</InnerLayout>
    </I18nProvider>
  );
}