'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ArrowLeft, CheckCircle, AlertCircle, Eye, EyeOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('No reset token provided');
      setIsValidating(false);
      return;
    }

    const validateToken = async () => {
      try {
        const response = await authApi.validateResetToken(token);
        if (response.valid) {
          setIsValid(true);
          setMaskedEmail(response.email);
        }
      } catch (err: any) {
        const message = err.response?.data?.detail || 'Invalid or expired reset token';
        setError(message);
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const validateForm = (): boolean => {
    const errors: {[key: string]: string} = {};
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/[a-z]/.test(formData.password)) {
      errors.password = 'Password must contain at least one lowercase letter';
    } else if (!/[A-Z]/.test(formData.password)) {
      errors.password = 'Password must contain at least one uppercase letter';
    } else if (!/[0-9]/.test(formData.password)) {
      errors.password = 'Password must contain at least one number';
    }
    
    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !token) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await authApi.resetPassword(token, formData.password);
      setIsSuccess(true);
      toast.success('Password reset successfully!');
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to reset password. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Validating reset token...</p>
        </motion.div>
      </div>
    );
  }

  // Invalid token or error
  if (!isValid && !isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100 mb-2">Invalid Reset Link</h1>
            <p className="text-slate-400">{error || 'This password reset link is invalid or has expired.'}</p>
          </div>

          <div className="space-y-4">
            <Link 
              href="/forgot-password" 
              className="btn-primary btn-lg w-full block text-center"
            >
              Request New Reset Link
            </Link>
            
            <Link 
              href="/login" 
              className="text-blue-400 hover:text-blue-300 text-sm flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100 mb-2">Password Reset!</h1>
            <p className="text-slate-400">Your password has been successfully reset. You can now log in with your new password.</p>
          </div>

          <Link 
            href="/login" 
            className="btn-primary btn-lg w-full block text-center"
          >
            <Shield className="w-5 h-5 inline mr-2" />
            Go to Login
          </Link>
        </motion.div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Reset Your Password</h1>
          {maskedEmail && (
            <p className="text-slate-400">
              Enter a new password for <span className="text-blue-400">{maskedEmail}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="label block mb-2 text-slate-300">
              New Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, password: e.target.value }));
                  if (validationErrors.password) {
                    setValidationErrors(prev => ({ ...prev, password: '' }));
                  }
                }}
                className={`input bg-slate-700 text-slate-100 border-slate-600 pr-10 ${
                  validationErrors.password ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'
                }`}
                placeholder="Enter new password"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPassword ? 
                  <EyeOff className="w-5 h-5 text-slate-400 hover:text-slate-300" /> : 
                  <Eye className="w-5 h-5 text-slate-400 hover:text-slate-300" />
                }
              </button>
            </div>
            {validationErrors.password && (
              <p className="mt-2 text-sm text-red-400">{validationErrors.password}</p>
            )}
            <div className="mt-2 text-xs text-slate-500">
              Password must be at least 8 characters with uppercase, lowercase, and a number.
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="label block mb-2 text-slate-300">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, confirmPassword: e.target.value }));
                  if (validationErrors.confirmPassword) {
                    setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                className={`input bg-slate-700 text-slate-100 border-slate-600 pr-10 ${
                  validationErrors.confirmPassword ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'
                }`}
                placeholder="Confirm new password"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showConfirmPassword ? 
                  <EyeOff className="w-5 h-5 text-slate-400 hover:text-slate-300" /> : 
                  <Eye className="w-5 h-5 text-slate-400 hover:text-slate-300" />
                }
              </button>
            </div>
            {validationErrors.confirmPassword && (
              <p className="mt-2 text-sm text-red-400">{validationErrors.confirmPassword}</p>
            )}
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary btn-lg w-full">
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Resetting Password...
              </div>
            ) : (
              <>
                <Lock className="w-5 h-5 inline mr-2" />
                Reset Password
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-blue-400 hover:text-blue-300 text-sm flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}

