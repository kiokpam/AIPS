'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Shield, 
  Eye, 
  EyeOff, 
  CheckCircle,
  Mail,
  User,
  Store,
  Info,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push('/cameras');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      await login(formData.email, formData.password);
    } catch (error) {
      // Error is handled by auth context
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left brand/benefits */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt="AIPS" className="w-8 h-8" />
          <span className="text-xl font-bold">AIPS</span>
        </Link>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">Store Surveillance System</h2>
          <p className="mt-4 text-blue-100 max-w-md">AI-powered monitoring, real-time alerts, and actionable analytics to secure and optimize your retail operations.</p>
          <ul className="mt-8 space-y-3 text-blue-100">
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> 24/7 Store Monitoring</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> People Counting & Analytics</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> Behavior Detection</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> Multi-Store Management</li>
          </ul>
        </div>
        <div className="text-sm text-blue-200">© {new Date().getFullYear()} AIPS. All rights reserved.</div>
      </div>

      {/* Right login pane */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-slate-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200"
        >
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h1>
              <p className="text-slate-600">Sign in to access your surveillance dashboard</p>
            </div>

            {/* Account Type Helper */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 mb-2">Which account type are you?</p>
                  <div className="space-y-2 text-xs text-blue-700">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span><strong>Manager:</strong> Use your manager email address</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4" />
                      <span><strong>Store Member:</strong> Use the email provided by your manager</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="label block mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`input ${errors.email ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500 focus:border-blue-500'}`}
                    placeholder="your-email@example.com"
                  />
                </div>
                {errors.email && (
                  <div className="flex items-center mt-2 text-sm text-red-600">
                    <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                    {errors.email}
                  </div>
                )}
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-slate-600">
                      <p className="font-medium mb-1">Need help finding your email?</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Managers:</strong> Use the email you registered with</li>
                        <li><strong>Store Members:</strong> Example email: <code className="bg-slate-200 px-1 rounded">store_f81e9c1b_cashier@store.internal</code> (store code + username)</li>
                        <li>Contact your manager if you don't have your login credentials</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label block mb-2">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500 focus:border-blue-500'}`}
                    placeholder="Enter your password"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)} 
                    className="absolute inset-y-0 right-0 pr-3 flex items-center hover:bg-slate-50 rounded-r transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5 text-slate-400 hover:text-slate-600" /> : <Eye className="w-5 h-5 text-slate-400 hover:text-slate-600" />}
                  </button>
                </div>
                {errors.password && (
                  <div className="flex items-center mt-2 text-sm text-red-600">
                    <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                    {errors.password}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input type="checkbox" className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 focus:ring-2" />
                  <span className="ml-2 text-sm text-slate-600">Remember me</span>
                </label>
                <Link href="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700 transition-colors">
                  Forgot password?
                </Link>
              </div>

              <button 
                type="submit" 
                disabled={isLoading} 
                className="btn-primary btn-lg w-full group relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center">
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Signing In...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 mr-2" />
                      Sign In
                    </>
                  )}
                </span>
                {!isLoading && (
                  <motion.div
                    className="absolute inset-0 bg-white/20"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.5 }}
                  />
                )}
              </button>
            </form>

            {/* Help Section */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-slate-600 text-sm mb-3">
                    Don't have an account?{' '}
                    <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                      Create manager account
                    </Link>
                  </p>
                </div>
                
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-medium mb-1">Store Member?</p>
                      <p>If you're a store member, your manager should provide you with your login credentials. Contact them if you need assistance.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
