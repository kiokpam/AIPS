'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function CreateOrganizationPage() {
  const router = useRouter();
  const { createOrganization, isAuthenticated, login } = useAuth();
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [formData, setFormData] = useState({
    name: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    // Check if user needs to login first
    const pendingEmail = localStorage.getItem('pending_user_email');
    if (!isAuthenticated && !pendingEmail) {
      router.push('/login');
      return;
    }
    if (!isAuthenticated && pendingEmail) {
      setNeedsLogin(true);
      setLoginData({ email: pendingEmail, password: '' });
    }
  }, [isAuthenticated, router]);

  const handleLoginAndCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.email || !loginData.password) {
      toast.error('Please enter your password');
      return;
    }
    try {
      await login(loginData.email, loginData.password);
      // After login, user will be redirected or can create org
      localStorage.removeItem('pending_user_email');
    } catch (error) {
      // Error handled by auth context
    }
  };

  if (!isAuthenticated && needsLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700"
        >
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-100 mb-2">Login Required</h2>
            <p className="text-slate-400">Please log in to create your organization</p>
          </div>
          <form onSubmit={handleLoginAndCreate} className="space-y-4">
            <div>
              <label className="label block mb-2 text-slate-300">Email</label>
              <input
                type="email"
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                className="input bg-slate-700 text-slate-100"
                disabled
              />
            </div>
            <div>
              <label className="label block mb-2 text-slate-300">Password</label>
              <input
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                className="input bg-slate-700 text-slate-100"
                placeholder="Enter your password"
              />
            </div>
            <button type="submit" className="btn-primary btn-lg w-full">
              Login & Continue
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Organization name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Organization name must be at least 3 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      await createOrganization(formData.name.trim());
    } catch (error) {
      // Error handled by auth context
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Create Organization</h1>
          <p className="text-slate-400">Set up your organization to get started</p>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">You'll be the manager</p>
              <p className="text-blue-300">
                As the organization creator, you'll have full management privileges. You can add team members later.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="label block mb-2 text-slate-300">
              <Building2 className="w-4 h-4 inline mr-1" />
              Organization Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              className={`input bg-slate-700 text-slate-100 border-slate-600 ${errors.name ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="Enter organization name"
            />
            {errors.name && (
              <div className="flex items-center mt-2 text-sm text-red-400">
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                {errors.name}
              </div>
            )}
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary btn-lg w-full">
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Creating...
              </div>
            ) : (
              'Create Organization'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

