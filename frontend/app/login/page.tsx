'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Shield, 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

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
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      localStorage.setItem('auth_token', 'demo_token_123');
      localStorage.setItem('user_email', formData.email);
      toast.success('Login successful!');
      router.push('/cameras');
    } catch (_) {
      toast.error('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left brand/benefits */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt="AIPS" className="w-8 h-8" />
          <span className="text-xl font-bold">AIPS</span>
        </Link>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">Always watching. Always protecting.</h2>
          <p className="mt-4 text-blue-100 max-w-md">AI-powered monitoring, real-time alerts, and actionable analytics to secure and optimize your operations.</p>
          <ul className="mt-8 space-y-3 text-blue-100">
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> 24/7 Monitoring</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> Cloud analytics</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> Privacy-first</li>
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
          className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-slate-200"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h1>
            <p className="text-slate-600">Sign in to your AIPS dashboard</p>
          </div>

          {/* Demo Credentials */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-1">Demo Credentials</p>
                <p className="text-blue-700">
                  Email: <span className="font-mono">admin@aips.com</span><br />
                  Password: <span className="font-mono">password123</span>
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="label block mb-2">Email Address</label>
              <div className="relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`input ${errors.email ? 'border-red-300 focus:ring-red-500' : ''}`}
                  placeholder="Enter your email"
                />
              </div>
              {errors.email && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.email}
                </div>
              )}
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
                  className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500' : ''}`}
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
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

            <button type="submit" disabled={isLoading} className="btn-primary btn-lg w-full group">
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Signing In...
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="my-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="btn-outline btn-md">Google</button>
            <button className="btn-outline btn-md">Facebook</button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              Don't have an account?{' '}
              <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">Sign up for free</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
