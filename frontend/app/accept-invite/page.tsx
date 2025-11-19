'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Mail, Lock, User, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { authApi, InviteResponse } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signupMember, isAuthenticated } = useAuth();
  const token = searchParams.get('token');
  
  const [inviteInfo, setInviteInfo] = useState<InviteResponse | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/cameras');
      return;
    }

    if (!token) {
      toast.error('Invalid invite link');
      router.push('/register');
      return;
    }

    loadInviteInfo();
  }, [token, isAuthenticated, router]);

  const loadInviteInfo = async () => {
    try {
      setIsLoadingInvite(true);
      const info = await authApi.getInviteInfo(token!);
      setInviteInfo(info);
      // Pre-fill email if invite is for specific email
      if (info.email) {
        setFormData(prev => ({ ...prev, email: info.email! }));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Invalid or expired invite');
      router.push('/register');
    } finally {
      setIsLoadingInvite(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    if (inviteInfo?.email && formData.email.toLowerCase() !== inviteInfo.email.toLowerCase()) {
      newErrors.email = 'This invite is for a different email address';
    }
    if (!formData.password) newErrors.password = 'Password is required';
    else {
      if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (!/[a-z]/.test(formData.password) || !/[A-Z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
        newErrors.password = 'Password must include lowercase, uppercase, and a number';
      } else if (formData.password.length > 128) {
        newErrors.password = 'Password must be less than 128 characters';
      }
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.name) newErrors.name = 'Name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !token) return;
    setIsSubmitting(true);
    try {
      await signupMember({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        inviteToken: token,
      });
    } catch (error) {
      // Error handled by auth context
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!inviteInfo) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">You're Invited!</h1>
          <p className="text-slate-400">Join {inviteInfo.role === 'manager' ? 'as a manager' : 'as a member'}</p>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">Invitation Details</p>
              <p className="text-blue-300">
                {inviteInfo.email 
                  ? `This invite is for: ${inviteInfo.email}`
                  : 'This is an open invitation'}
              </p>
              {inviteInfo.expires_at && (
                <p className="text-blue-300 mt-1">
                  Expires: {new Date(inviteInfo.expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="label block mb-2 text-slate-300">
              <User className="w-4 h-4 inline mr-1" />
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              className={`input bg-slate-700 text-slate-100 ${errors.name ? 'border-red-500' : ''}`}
              placeholder="Enter your full name"
            />
            {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="label block mb-2 text-slate-300">
              <Mail className="w-4 h-4 inline mr-1" />
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={!!inviteInfo.email}
              className={`input bg-slate-700 text-slate-100 ${errors.email ? 'border-red-500' : ''} ${inviteInfo.email ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="Enter your email"
            />
            {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="label block mb-2 text-slate-300">
              <Lock className="w-4 h-4 inline mr-1" />
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleInputChange}
              className={`input bg-slate-700 text-slate-100 ${errors.password ? 'border-red-500' : ''}`}
              placeholder="Create a password"
            />
            {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="label block mb-2 text-slate-300">
              <Lock className="w-4 h-4 inline mr-1" />
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              className={`input bg-slate-700 text-slate-100 ${errors.confirmPassword ? 'border-red-500' : ''}`}
              placeholder="Confirm your password"
            />
            {errors.confirmPassword && <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary btn-lg w-full">
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Creating Account...
              </div>
            ) : (
              'Accept Invite & Create Account'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-400 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Log in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

