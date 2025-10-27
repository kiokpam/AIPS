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
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    current: false
  }
];

export default function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? '256px' : '0px',
        backgroundColor: 'white',
        borderRight: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Sidebar Header */}
        <div style={{
          height: '64px',
          padding: '0 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: '#3b82f6',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <Shield style={{ width: '20px', height: '20px', color: 'white' }} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>AIPS</span>
          </div>
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
              e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X style={{ width: '16px', height: '16px', color: '#64748b' }} />
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
                  color: isActive ? '#1d4ed8' : '#64748b',
                  backgroundColor: isActive ? '#dbeafe' : 'transparent',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
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
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc'
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
                color: '#1e293b',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {getUserEmail()}
              </p>
              <p style={{
                fontSize: '12px',
                color: '#64748b',
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
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
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
              e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Menu style={{ width: '20px', height: '20px', color: '#64748b' }} />
          </button>
          <h1 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#1e293b',
            margin: 0
          }}>
            {navigation.find(item => item.href === pathname)?.name || 'AIPS'}
          </h1>
        </div>

        {/* Right side - notifications and user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
            e.currentTarget.style.backgroundColor = '#f1f5f9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          >
            <Bell style={{ width: '20px', height: '20px', color: '#64748b' }} />
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
                backgroundColor: '#dbeafe',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <User style={{ width: '16px', height: '16px', color: '#1d4ed8' }} />
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#1e293b'
              }}>
                {getUserEmail()}
              </span>
              <ChevronDown style={{ width: '16px', height: '16px', color: '#64748b' }} />
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '8px',
                width: '200px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e2e8f0',
                zIndex: 50
              }}>
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid #e2e8f0'
                }}>
                  <p style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#1e293b',
                    margin: 0
                  }}>
                    {getUserEmail()}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: '#64748b',
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
                    color: '#64748b',
                    fontSize: '14px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
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
        <main style={{ padding: '24px' }}>
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
          onClick={() => setUserMenuOpen(false)}
        />
      )}
    </div>
  );
}