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
import { useI18n } from '@/src/contexts/I18nContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { lang, setLanguage } = useI18n();

  // Translation function for login page
  const t = (key: string): string => {
    const dict: Record<string, { en: string; vi: string }> = {
      // Left panel
      brand_title: { en: 'Store Surveillance System', vi: 'Hệ thống Giám sát Cửa hàng' },
      brand_desc: { en: 'AI-powered monitoring, real-time alerts, and actionable analytics to secure and optimize your retail operations.', vi: 'Giám sát bằng AI, cảnh báo thời gian thực và phân tích dữ liệu để bảo vệ và tối ưu hoạt động bán lẻ của bạn.' },
      feature_monitoring: { en: '24/7 Store Monitoring', vi: 'Giám sát cửa hàng 24/7' },
      feature_counting: { en: 'People Counting & Analytics', vi: 'Đếm người & Phân tích' },
      feature_behavior: { en: 'Behavior Detection', vi: 'Phát hiện hành vi' },
      feature_multistore: { en: 'Multi-Store Management', vi: 'Quản lý đa cửa hàng' },
      copyright: { en: 'All rights reserved.', vi: 'Bảo lưu mọi quyền.' },
      
      // Right panel - Login form
      welcome_back: { en: 'Welcome Back', vi: 'Chào mừng trở lại' },
      sign_in_desc: { en: 'Sign in to access your surveillance dashboard', vi: 'Đăng nhập để truy cập bảng điều khiển giám sát' },
      
      // Account type helper
      which_account: { en: 'Which account type are you?', vi: 'Bạn thuộc loại tài khoản nào?' },
      manager_hint: { en: 'Use your manager email address', vi: 'Sử dụng email quản lý của bạn' },
      member_hint: { en: 'Use the email provided by your manager', vi: 'Sử dụng email do quản lý cung cấp' },
      
      // Form labels
      email_label: { en: 'Email Address', vi: 'Địa chỉ Email' },
      email_placeholder: { en: 'your-email@example.com', vi: 'email-cua-ban@example.com' },
      password_label: { en: 'Password', vi: 'Mật khẩu' },
      password_placeholder: { en: 'Enter your password', vi: 'Nhập mật khẩu' },
      
      // Email help
      email_help_title: { en: 'Need help finding your email?', vi: 'Cần trợ giúp tìm email?' },
      email_help_manager: { en: 'Use the email you registered with', vi: 'Sử dụng email bạn đã đăng ký' },
      email_help_member: { en: 'Example email:', vi: 'Email mẫu:' },
      email_help_contact: { en: "Contact your manager if you don't have your login credentials", vi: 'Liên hệ quản lý nếu bạn chưa có thông tin đăng nhập' },
      
      // Validation errors
      email_required: { en: 'Email is required', vi: 'Email là bắt buộc' },
      email_invalid: { en: 'Email is invalid', vi: 'Email không hợp lệ' },
      password_required: { en: 'Password is required', vi: 'Mật khẩu là bắt buộc' },
      
      // Actions
      remember_me: { en: 'Remember me for 7 days', vi: 'Ghi nhớ đăng nhập 7 ngày' },
      forgot_password: { en: 'Forgot password?', vi: 'Quên mật khẩu?' },
      signing_in: { en: 'Signing In...', vi: 'Đang đăng nhập...' },
      sign_in: { en: 'Sign In', vi: 'Đăng nhập' },
      
      // Help section
      no_account: { en: "Don't have an account?", vi: 'Chưa có tài khoản?' },
      create_manager: { en: 'Create manager account', vi: 'Tạo tài khoản quản lý' },
      store_member_title: { en: 'Store Member?', vi: 'Nhân viên cửa hàng?' },
      store_member_hint: { en: 'If you\'re a store member, your manager should provide you with your login credentials. Contact them if you need assistance.', vi: 'Nếu bạn là nhân viên cửa hàng, quản lý sẽ cung cấp thông tin đăng nhập cho bạn. Liên hệ họ nếu cần hỗ trợ.' },
    };
    return dict[key]?.[lang] ?? key;
  };
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Load saved email if remember me was used before
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    const wasRemembered = localStorage.getItem('remember_me') === 'true';
    if (savedEmail && wasRemembered) {
      setFormData(prev => ({ ...prev, email: savedEmail, rememberMe: true }));
    }
  }, []);

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
    if (!formData.email) newErrors.email = t('email_required');
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = t('email_invalid');
    if (!formData.password) newErrors.password = t('password_required');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      // Save email if remember me is checked
      if (formData.rememberMe) {
        localStorage.setItem('remembered_email', formData.email);
      } else {
        localStorage.removeItem('remembered_email');
      }
      await login(formData.email, formData.password, undefined, formData.rememberMe);
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
          <h2 className="text-4xl font-extrabold leading-tight">{t('brand_title')}</h2>
          <p className="mt-4 text-blue-100 max-w-md">{t('brand_desc')}</p>
          <ul className="mt-8 space-y-3 text-blue-100">
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> {t('feature_monitoring')}</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> {t('feature_counting')}</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> {t('feature_behavior')}</li>
            <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-blue-200" /> {t('feature_multistore')}</li>
          </ul>
        </div>
        <div className="text-sm text-blue-200">© {new Date().getFullYear()} AIPS. {t('copyright')}</div>
      </div>

      {/* Right login pane */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-slate-50 relative">
        {/* Language Switcher */}
        <div className="absolute top-6 right-6 flex items-center gap-3">
          <button
            onClick={() => setLanguage('vi')}
            className={`flex flex-col items-center transition-all ${lang === 'vi' ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
          >
            <span className="text-xs font-semibold text-slate-700">VI</span>
            <div className={`h-[2px] w-8 bg-blue-600 mt-1 transition-opacity ${lang === 'vi' ? 'opacity-100' : 'opacity-0'}`} />
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`flex flex-col items-center transition-all ${lang === 'en' ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
          >
            <span className="text-xs font-semibold text-slate-700">EN</span>
            <div className={`h-[2px] w-8 bg-blue-600 mt-1 transition-opacity ${lang === 'en' ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        </div>

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
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('welcome_back')}</h1>
              <p className="text-slate-600">{t('sign_in_desc')}</p>
            </div>

            {/* Account Type Helper */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 mb-2">{t('which_account')}</p>
                  <div className="space-y-2 text-xs text-blue-700">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span><strong>Manager:</strong> {t('manager_hint')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4" />
                      <span><strong>Store Member:</strong> {t('member_hint')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="label block mb-2">
                  {t('email_label')}
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`input ${errors.email ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500 focus:border-blue-500'}`}
                    placeholder={t('email_placeholder')}
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
                      <p className="font-medium mb-1">{t('email_help_title')}</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Managers:</strong> {t('email_help_manager')}</li>
                        <li><strong>Store Members:</strong> {t('email_help_member')} <code className="bg-slate-200 px-1 rounded">store_f81e9c1b_cashier@store.internal</code></li>
                        <li>{t('email_help_contact')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label block mb-2">{t('password_label')}</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500 focus:border-blue-500'}`}
                    placeholder={t('password_placeholder')}
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
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.rememberMe}
                    onChange={(e) => setFormData(prev => ({ ...prev, rememberMe: e.target.checked }))}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer" 
                  />
                  <span className="ml-2 text-sm text-slate-600">{t('remember_me')}</span>
                </label>
                <Link href="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700 transition-colors">
                  {t('forgot_password')}
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
                      {t('signing_in')}
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 mr-2" />
                      {t('sign_in')}
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
                    {t('no_account')}{' '}
                    <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                      {t('create_manager')}
                    </Link>
                  </p>
                </div>
                
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-medium mb-1">{t('store_member_title')}</p>
                      <p>{t('store_member_hint')}</p>
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
