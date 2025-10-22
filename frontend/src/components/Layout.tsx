import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  Store, 
  Camera, 
  LogIn, 
  Shield,
  Activity,
  Settings,
  LogOut,
  User
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, protected: true },
  { name: 'Stores', href: '/stores', icon: Store, protected: true },
  { name: 'Cameras', href: '/cameras', icon: Camera, protected: true },
  { name: 'Login', href: '/login', icon: LogIn, protected: false },
];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-soft border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Shield className="h-8 w-8 text-primary-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">
                  AIPS
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  AI-Powered Surveillance
                </span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex space-x-8">
              {navigation.map((item) => {
                // Hide protected routes if not authenticated, hide login if authenticated
                if ((item.protected && !isAuthenticated) || (item.name === 'Login' && isAuthenticated)) {
                  return null;
                }
                
                const isActive = router.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'text-primary-600 bg-primary-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <item.icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Status Indicators & User Menu */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-success-500" />
                <span className="text-sm text-gray-600">System Online</span>
              </div>
              
              {isAuthenticated && user && (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700">{user.username}</span>
                  </div>
                  <button
                    onClick={logout}
                    className="btn btn-secondary btn-sm"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-gray-50">
            {navigation.map((item) => {
              // Hide protected routes if not authenticated, hide login if authenticated
              if ((item.protected && !isAuthenticated) || (item.name === 'Login' && isAuthenticated)) {
                return null;
              }
              
              const isActive = router.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200 ${
                    isActive
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center">
                    <item.icon className="h-4 w-4 mr-3" />
                    {item.name}
                  </div>
                </Link>
              );
            })}
            
            {isAuthenticated && user && (
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="px-3 py-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-3" />
                    {user.username}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-200"
                >
                  <div className="flex items-center">
                    <LogOut className="h-4 w-4 mr-3" />
                    Logout
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              © 2024 AIPS. AI-Powered Intelligent Surveillance System.
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Version 1.0.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
