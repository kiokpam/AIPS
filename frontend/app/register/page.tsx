'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Shield, 
  Eye, 
  EyeOff, 
  CheckCircle,
  Building2,
  User,
  Mail,
  Lock
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const { signupManager, isAuthenticated, isLoading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    organizationName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [passwordStrength, setPasswordStrength] = useState<{score: number; feedback: string[]}>({score: 0, feedback: []});
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push('/cameras');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    
    // Update password strength in real-time
    if (name === 'password') {
      setPasswordStrength(checkPasswordStrength(value));
    }
  };

  const checkPasswordStrength = (password: string) => {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) {
      score += 1;
    } else {
      feedback.push('At least 8 characters');
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('One lowercase letter');
    }

    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('One uppercase letter');
    }

    if (/[0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('One number');
    }

    return { score, feedback };
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    // Name validation
    if (!formData.name) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Name must be less than 100 characters';
    } else if (!/^[a-zA-Z\s'-]+$/.test(formData.name.trim())) {
      newErrors.name = 'Name can only contain letters, spaces, hyphens, and apostrophes';
    }

    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    } else if (formData.email.length > 255) {
      newErrors.email = 'Email must be less than 255 characters';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      const strength = checkPasswordStrength(formData.password);
      if (strength.score < 4) {
        newErrors.password = `Password must meet all requirements: ${strength.feedback.join(', ')}`;
      } else if (formData.password.length > 128) {
        newErrors.password = 'Password must be less than 128 characters';
      }
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.organizationName.trim()) {
      newErrors.organizationName = 'Organization name is required';
    } else if (formData.organizationName.trim().length < 2) {
      newErrors.organizationName = 'Organization name must be at least 2 characters';
    } else if (formData.organizationName.trim().length > 150) {
      newErrors.organizationName = 'Organization name must be less than 150 characters';
    } else if (!/^[a-zA-Z0-9\s&'()-]+$/.test(formData.organizationName.trim())) {
      newErrors.organizationName = 'Organization name contains invalid characters';
    }

    // Terms and conditions
    if (!acceptedTerms) {
      newErrors.terms = 'You must accept the terms and conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      await signupManager({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        organizationName: formData.organizationName.trim(),
      });
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
          <h2 className="text-4xl font-extrabold leading-tight">Start your surveillance journey</h2>
          <p className="mt-4 text-blue-100 max-w-md">Create your account and set up your organization after login.</p>
          <ul className="mt-8 space-y-3 text-blue-100">
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> Free to get started</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> No credit card required</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> Full feature access</li>
          </ul>
        </div>
        <div className="text-sm text-blue-200">© {new Date().getFullYear()} AIPS. All rights reserved.</div>
      </div>

      {/* Right signup pane */}
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
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Create Manager Account</h1>
            <p className="text-slate-600">
              Create an account and your first organization
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="label block mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange}
                className={`input ${errors.name ? 'border-red-300 focus:ring-red-500' : ''}`}
                placeholder="Enter your full name"
                maxLength={100}
              />
              <p className="text-xs text-slate-500 mt-1">
                Your name will be visible to organization members
              </p>
              {errors.name && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.name}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="email" className="label block mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`input ${errors.email ? 'border-red-300 focus:ring-red-500' : ''}`}
                placeholder="your-email@example.com"
              />
              {errors.email && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.email}
                </div>
              )}
            </div>


            <div>
              <label htmlFor="organizationName" className="label block mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                Organization Name
              </label>
              <input
                id="organizationName"
                name="organizationName"
                type="text"
                value={formData.organizationName}
                onChange={handleInputChange}
                className={`input ${errors.organizationName ? 'border-red-300 focus:ring-red-500' : ''}`}
                placeholder="Enter your organization name"
                maxLength={150}
              />
              <p className="text-xs text-slate-500 mt-1">
                This will be the workspace for your team. You can set up member access after signup.
              </p>
              {errors.organizationName && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.organizationName}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label block mb-2">
                <Lock className="w-4 h-4 inline mr-1" />
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500' : passwordStrength.score >= 4 ? 'border-green-300 focus:ring-green-500' : ''}`}
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  {showPassword ? <EyeOff className="w-5 h-5 text-slate-400 hover:text-slate-600" /> : <Eye className="w-5 h-5 text-slate-400 hover:text-slate-600" />}
                </button>
              </div>
              
              {/* Password Strength Meter */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded ${
                          level <= passwordStrength.score
                            ? passwordStrength.score <= 1
                              ? 'bg-red-500'
                              : passwordStrength.score <= 3
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${passwordStrength.score >= 4 ? 'text-green-600' : passwordStrength.score >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {passwordStrength.score >= 4
                      ? 'Strong password ✓'
                      : passwordStrength.score >= 2
                      ? 'Moderate password'
                      : 'Weak password'}
                  </p>
                </div>
              )}

              {/* Password Requirements */}
              {formData.password && passwordStrength.score < 4 && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Password must include:</p>
                  <ul className="text-xs text-slate-600 space-y-1">
                    {passwordStrength.feedback.map((req, idx) => (
                      <li key={idx} className="flex items-center">
                        <span className="mr-2 text-red-500">✗</span>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {errors.password && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.password}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label block mb-2">
                <Lock className="w-4 h-4 inline mr-1" />
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className={`input pr-10 ${errors.confirmPassword ? 'border-red-300 focus:ring-red-500' : ''}`}
                  placeholder="Confirm your password"
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  {showConfirmPassword ? <EyeOff className="w-5 h-5 text-slate-400 hover:text-slate-600" /> : <Eye className="w-5 h-5 text-slate-400 hover:text-slate-600" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.confirmPassword}
                </div>
              )}
            </div>

            {/* Terms and Conditions */}
            <div>
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    if (errors.terms) setErrors(prev => ({ ...prev, terms: '' }));
                  }}
                  className="mt-1 w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 focus:ring-2"
                />
                <span className="ml-2 text-sm text-slate-600">
                  I agree to the{' '}
                  <Link href="/terms" className="text-primary-600 hover:text-primary-700 font-medium">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-primary-600 hover:text-primary-700 font-medium">
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {errors.terms && (
                <div className="flex items-center mt-2 text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>
                  {errors.terms}
                </div>
              )}
            </div>

            <button type="submit" disabled={isLoading || !acceptedTerms} className="btn-primary btn-lg w-full group disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Creating Account...
                </div>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              Already have an account?{' '}
              <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

