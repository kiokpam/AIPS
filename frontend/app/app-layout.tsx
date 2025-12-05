'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  X,
  Users,
  Building2,
  Video,
  Activity,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';
import NotificationDropdown from '../components/NotificationDropdown';

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
    href: '/dashboard/in-out',
    icon: BarChart3,
    current: false,
    children: [
      {
        name: 'In/Out Analytics',
        href: '/dashboard/in-out',
        icon: TrendingUp
      },
      {
        name: 'Behavior Monitoring',
        href: '/dashboard/behavior',
        icon: Activity
      }
    ]
  },
  {
    name: 'Videos',
    href: '/videos',
    icon: Video,
    current: false
  },
];

function InnerLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, switchOrganization, isAuthenticated, isLoading: authLoading, connectionError, retryAuth } = useAuth();
  const hasRedirectedRef = useRef(false); // Prevent multiple redirects
  
  // Reset redirect flag when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      hasRedirectedRef.current = false;
    }
  }, [isAuthenticated]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
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

  // Handle click outside to close menus
  useEffect(() => {
    if (!userMenuOpen && !orgMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking on menu elements or their triggers
      if (
        target.closest('[data-user-menu]') ||
        target.closest('[data-org-menu]') ||
        target.closest('[data-user-menu-trigger]') ||
        target.closest('[data-org-menu-trigger]')
      ) {
        return;
      }
      setUserMenuOpen(false);
      setOrgMenuOpen(false);
    };

    // Use capture phase to catch events before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [userMenuOpen, orgMenuOpen]);

  // Force default dark theme once
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const body = document.body;
      if (!body.classList.contains('dark-blue')) body.classList.add('dark-blue');
    }
  }, []);

  const setLanguageLocal = (l: 'en' | 'vi') => setLanguage(l);

  const handleOrgSwitch = async (orgId: string) => {
    try {
      await switchOrganization(orgId);
      setOrgMenuOpen(false);
    } catch (error) {
      // Error handled by auth context
    }
  };

  // Public pages that don't require authentication
  const publicPages = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/terms', '/privacy', '/features'];
  if (publicPages.includes(pathname)) {
    return <>{children}</>;
  }

  // Show loading spinner during auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show connection error page when backend is down but user has a token
  if (connectionError && localStorage.getItem('auth_token')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Connection Error</h2>
          <p className="text-slate-400 mb-6">
            Unable to connect to the server. Please check if the backend is running.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => retryAuth()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Retry Connection
            </button>
            <button
              onClick={() => {
                logout();
              }}
              className="px-6 py-3 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors font-medium"
            >
              Logout &amp; Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated (only once)
  if (!isAuthenticated && !hasRedirectedRef.current) {
    hasRedirectedRef.current = true;
    router.push('/login');
    return null;
  }
  
  // If already redirecting, show nothing
  if (!isAuthenticated) {
    return null;
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
            const isActive = pathname === item.href || (item.children && item.children.some(child => pathname === child.href));
            const hasChildren = item.children && item.children.length > 0;
            
            return (
              <div key={item.name} style={{ marginBottom: '8px' }}>
                <Link
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
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
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <item.icon style={{ width: '20px', height: '20px', marginRight: '12px' }} />
                    {item.name}
                  </div>
                  {hasChildren && (
                    <ChevronDown style={{ width: '16px', height: '16px' }} />
                  )}
                </Link>
                {hasChildren && (
                  <div style={{ marginLeft: '32px', marginTop: '4px' }}>
                    {item.children!.map((child) => {
                      const isChildActive = pathname === child.href;
                      return (
                        <Link
                          key={child.name}
                          href={child.href}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 12px',
                            marginBottom: '4px',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            color: isChildActive ? '#60a5fa' : '#94a3b8',
                            backgroundColor: isChildActive ? '#0b1325' : 'transparent',
                            fontWeight: isChildActive ? '600' : '400',
                            fontSize: '14px',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isChildActive) {
                              e.currentTarget.style.backgroundColor = '#0b1325';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isChildActive) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <child.icon style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {user?.active_membership.role === 'member' && (
            <Link
              href="/my-organization"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                marginBottom: '8px',
                borderRadius: '8px',
                textDecoration: 'none',
                color: pathname === '/my-organization' ? '#60a5fa' : '#94a3b8',
                backgroundColor: pathname === '/my-organization' ? '#0b1325' : 'transparent',
                fontWeight: pathname === '/my-organization' ? '600' : '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (pathname !== '/my-organization') {
                  e.currentTarget.style.backgroundColor = '#0b1325';
                }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/my-organization') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <Building2 style={{ width: '20px', height: '20px', marginRight: '12px' }} />
              My Organization
            </Link>
          )}
          {user?.active_membership.role === 'manager' && (
            <>
              <Link
                href="/organizations"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: pathname === '/organizations' ? '#60a5fa' : '#94a3b8',
                  backgroundColor: pathname === '/organizations' ? '#0b1325' : 'transparent',
                  fontWeight: pathname === '/organizations' ? '600' : '500',
                  transition: 'all 0.2s'
                }}
              >
                <Building2 style={{ width: '20px', height: '20px', marginRight: '12px' }} />
                Organizations
              </Link>
              <Link
                href="/managers"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: pathname === '/managers' ? '#60a5fa' : '#94a3b8',
                  backgroundColor: pathname === '/managers' ? '#0b1325' : 'transparent',
                  fontWeight: pathname === '/managers' ? '600' : '500',
                  transition: 'all 0.2s'
                }}
              >
                <Users style={{ width: '20px', height: '20px', marginRight: '12px' }} />
                Team Management
              </Link>
            </>
          )}
        </nav>

        {/* User info in sidebar */}
        {user && (
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
                  {user.user.name}
                </p>
                <p style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  margin: 0
                }}>
                  {user.active_membership.role === 'manager' ? 'Manager' : 'Member'}
                </p>
              </div>
            </div>
          </div>
        )}
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

        {/* Right side - organization switcher, language, notifications and user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Organization Switcher */}
          {user && user.memberships.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                data-org-menu-trigger
                onClick={() => setOrgMenuOpen(!orgMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: '#94a3b8'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0b1325';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Building2 style={{ width: '16px', height: '16px' }} />
                <span style={{ fontSize: '14px', fontWeight: '500' }}>
                  {user.active_membership.organization.name}
                </span>
                <ChevronDown style={{ width: '16px', height: '16px' }} />
              </button>

              {orgMenuOpen && (
                <div 
                  data-org-menu
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: '8px',
                    width: '250px',
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    boxShadow: '0 12px 30px rgba(2,6,23,.45)',
                    border: '1px solid #1f2937',
                    zIndex: 1000
                  }}
                >
                  <div style={{ padding: '8px' }}>
                    {user.memberships.map((membership) => (
                      <button
                        key={membership.id}
                        onClick={() => handleOrgSwitch(membership.organization.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '12px',
                          textAlign: 'left',
                          color: membership.id === user.active_membership.id ? '#60a5fa' : '#94a3b8',
                          fontSize: '14px',
                          border: 'none',
                          backgroundColor: membership.id === user.active_membership.id ? '#0b1325' : 'transparent',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          marginBottom: '4px'
                        }}
                        onMouseEnter={(e) => {
                          if (membership.id !== user.active_membership.id) {
                            e.currentTarget.style.backgroundColor = '#0b1325';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (membership.id !== user.active_membership.id) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <span>{membership.organization.name}</span>
                        {membership.id === user.active_membership.id && (
                          <span style={{ fontSize: '12px', color: '#60a5fa' }}>Active</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setNotificationOpen(!notificationOpen)}
              style={{
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
              {notificationUnreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%'
                }}></span>
              )}
            </button>
            {notificationOpen && (
              <NotificationDropdown
                isOpen={notificationOpen}
                onClose={() => setNotificationOpen(false)}
                unreadCount={notificationUnreadCount}
                onUnreadCountChange={setNotificationUnreadCount}
              />
            )}
          </div>

          {/* User menu */}
          <div style={{ position: 'relative' }}>
            <button
              data-user-menu-trigger
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
                {user?.user.name || 'User'}
              </span>
              <ChevronDown style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
            </button>

            {userMenuOpen && (
              <div 
                data-user-menu
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '8px',
                  width: '200px',
                  backgroundColor: '#0f172a',
                  borderRadius: '8px',
                  boxShadow: '0 12px 30px rgba(2,6,23,.45)',
                  border: '1px solid #1f2937',
                  zIndex: 1000
                }}
              >
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
                    {user?.user.name || 'User'}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    margin: 0
                  }}>
                    {user?.user.email}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: '#60a5fa',
                    margin: '4px 0 0 0'
                  }}>
                    {user?.active_membership.role === 'manager' ? 'Manager' : 'Member'} • {user?.active_membership.organization.name}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    logout();
                    setUserMenuOpen(false);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  type="button"
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
                    cursor: 'pointer',
                    zIndex: 1001
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

      {/* Click outside to close menus - using event listener instead of overlay */}
    </div>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  return <InnerLayout>{children}</InnerLayout>;
}