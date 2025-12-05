'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Camera, 
  BarChart3, 
  Brain, 
  Users, 
  AlertTriangle,
  ArrowRight,
  Play,
  CheckCircle,
  Star,
  User,
  LogOut,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from '@/src/contexts/I18nContext';
import { useAuth } from '@/src/contexts/AuthContext';

function LanguageButton() {
  const { lang, setLanguage } = useI18n();

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center cursor-pointer" onClick={() => setLanguage('vi')}>
        <span className="text-xs font-semibold text-slate-200">VI</span>
        <div className={`h-[3px] w-11 bg-white mt-1 ${lang==='vi' ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
      </div>
      <div className="flex flex-col items-center cursor-pointer" onClick={() => setLanguage('en')}>
        <span className="text-xs font-semibold text-slate-200">EN</span>
        <div className={`h-[3px] w-11 bg-white mt-1 ${lang==='en' ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
      </div>
    </div>
  );
}

export default function HomePage() {
  const { lang } = useI18n();
  const { user, isAuthenticated, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  // Prevent menu from closing when clicking inside the menu
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const t = (key: string): string => {
    const dict: Record<string, { en: string; vi: string }> = {
      nav_signin: { en: 'Sign In', vi: 'Đăng nhập' },
      hero_title: { en: 'AI-Powered Store Surveillance', vi: 'Giám sát cửa hàng bằng AI' },
      hero_sub: { en: 'Real-time detection, people counting, and analytics on a scalable microservices platform. Edge or cloud, privacy-first by design.', vi: 'Phát hiện thời gian thực, đếm người và phân tích trên nền tảng vi dịch vụ mở rộng. Chạy Edge hoặc Cloud, ưu tiên quyền riêng tư.' },
      cta_get_started: { en: 'Get Started', vi: 'Bắt đầu' },
      cta_watch_demo: { en: 'Watch Demo', vi: 'Xem demo' },
      perk_free: { en: 'Free Trial', vi: 'Dùng thử miễn phí' },
      perk_no_setup: { en: 'No Setup Fees', vi: 'Không phí cài đặt' },
      perk_support: { en: '24/7 Support', vi: 'Hỗ trợ 24/7' },
      features_title: { en: 'Powerful Features for Modern Retail', vi: 'Tính năng mạnh mẽ cho bán lẻ hiện đại' },
      features_sub: { en: 'Our AI-powered surveillance system provides comprehensive security and analytics solutions tailored for retail environments.', vi: 'Hệ thống giám sát dùng AI cung cấp giải pháp an ninh và phân tích toàn diện cho môi trường bán lẻ.' },
      // Features cards
      features_rtm_title: { en: 'Real-time Monitoring', vi: 'Giám sát theo thời gian thực' },
      features_rtm_desc: { en: 'Live camera streaming with YOLO detection, DeepSORT tracking, and instant WebSocket notifications.', vi: 'Phát video camera trực tiếp với phát hiện YOLO, theo dõi DeepSORT và thông báo WebSocket tức thời.' },
      features_people_title: { en: 'People Counting', vi: 'Đếm số người' },
      features_people_desc: { en: 'Real-time in/out counting and people tracking with line-based detection and zone\u00A0monitoring.', vi: 'Đếm vào/ra thời gian thực và theo dõi người với phát hiện dựa trên đường và giám\u00A0sát\u00A0vùng.' },
      features_behavior_title: { en: 'Behavior Detection', vi: 'Phát hiện hành vi' },
      features_behavior_desc: { en: 'AI-powered detection of shoplifting and violence with real-time alerts and video\u00A0clips.', vi: 'Phát hiện shoplifting và bạo lực bằng AI với cảnh báo thời gian thực và video clip.' },
      features_analytics_title: { en: 'Analytics Dashboard', vi: 'Bảng điều khiển phân tích' },
      features_analytics_desc: { en: 'Dashboard with behavior alerts, in/out statistics, and saved video clips for review and analysis.', vi: 'Bảng điều khiển với cảnh báo hành vi, thống kê vào/ra và video clip đã lưu để xem xét và phân tích.' },
      stats_title: { en: 'Trusted by Retailers Worldwide', vi: 'Được các nhà bán lẻ tin dùng trên toàn cầu' },
      cta2_title: { en: 'Ready to Secure Your Store?', vi: 'Sẵn sàng bảo vệ cửa hàng của bạn?' },
      cta2_sub: { en: 'Start your free trial today and experience the power of AI-driven surveillance. No setup fees, no long-term contracts.', vi: 'Bắt đầu dùng thử miễn phí ngay hôm nay và trải nghiệm sức mạnh giám sát bằng AI. Không phí cài đặt, không ràng buộc dài hạn.' },
      cta2_btn_trial: { en: 'Start Free Trial', vi: 'Bắt đầu dùng thử' },
      cta2_btn_demo: { en: 'Schedule Demo', vi: 'Đặt lịch demo' },
    };
    return dict[key]?.[lang] ?? key;
  };

  const features = [
    {
      icon: Camera,
      title: t('features_rtm_title'),
      description: t('features_rtm_desc'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      icon: Users,
      title: t('features_people_title'),
      description: t('features_people_desc'),
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      icon: Brain,
      title: t('features_behavior_title'),
      description: t('features_behavior_desc'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      icon: BarChart3,
      title: t('features_analytics_title'),
      description: t('features_analytics_desc'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ];

  // no manage button; no auth state needed here

  const stats = [
    { label: lang === 'vi' ? 'Trạng thái' : 'Status', value: lang === 'vi' ? 'Đang hoạt động' : 'Active', icon: Shield },
    { label: lang === 'vi' ? 'AI Models' : 'AI Models', value: 'YOLO + VideoMAE', icon: Camera },
    { label: lang === 'vi' ? 'Phát hiện' : 'Detection', value: lang === 'vi' ? 'Shoplifting & Violence' : 'Shoplifting & Violence', icon: AlertTriangle },
    { label: lang === 'vi' ? 'Độ chính xác' : 'Accuracy', value: lang === 'vi' ? 'Cao' : 'High', icon: Star }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b1220] to-[#0a0f1d] text-slate-100">
      {/* Navigation */}
      <nav className="bg-black/60 backdrop-blur-md border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <img src="/logo.svg" alt="AIPS" className="w-8 h-8" />
              <span className="text-xl font-bold text-slate-100">AIPS</span>
            </Link>
            <div className="flex items-center space-x-4">
              {/* Language selector (EN/VI) */}
              <LanguageButton />
              {isAuthenticated && user ? (
                <div className="relative user-menu-container">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                  >
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-left hidden sm:block">
                      <p className="text-sm font-medium text-slate-100">{user.user.name}</p>
                      <p className="text-xs text-slate-400">{user.active_membership.organization.name}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>
                  {showUserMenu && (
                    <div 
                      className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-50"
                      onClick={handleMenuClick}
                    >
                      <div className="p-4 border-b border-slate-700">
                        <p className="text-sm font-medium text-slate-100">{user.user.name}</p>
                        <p className="text-xs text-slate-400 mt-1">{user.user.email}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {user.active_membership.role === 'manager' ? 'Manager' : 'Member'} • {user.active_membership.organization.name}
                        </p>
                      </div>
                      <div className="p-2">
                        <Link
                          href="/cameras"
                          className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                          onClick={() => setShowUserMenu(false)}
                        >
                          Go to Dashboard
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            logout();
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors mt-1"
                          type="button"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/login" className="btn-primary btn-md">{t('nav_signin')}</Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated gradient background overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_100%_at_10%_10%,rgba(57,179,246,0.18)_0%,rgba(70,69,212,0.15)_40%,rgba(12,16,64,0)_100%)] pointer-events-none animate-gradient-fade z-0" />
        {/* Stars pattern overlay */}
        <div className="absolute inset-0 bg-slate-900 opacity-40 pointer-events-none z-0" />
        {/* Subtle animated grid overlay */}
        <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
          <div className="w-full h-full opacity-[0.06]" style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)`,
            backgroundSize: '48px 48px, 48px 48px',
            maskImage: 'linear-gradient(180deg, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage: 'linear-gradient(180deg, transparent, black 15%, black 85%, transparent)'
          }} />
        </div>
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl z-0" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-purple-500/25 blur-3xl z-0" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10">
          <div className="grid grid-cols-1 items-center justify-items-center text-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8 max-w-3xl mx-auto"
            >
              <div className="space-y-6">
                <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight drop-shadow-[0_2px_8px_rgba(17,74,140,0.13)]">
                  {lang === 'vi' ? (
                    <>Giám sát cửa hàng <span className="whitespace-nowrap">bằng AI</span></>
                  ) : (
                    t('hero_title')
                  )}
                </h1>
                <p className="text-xl text-slate-300 leading-relaxed max-w-3xl mx-auto">{t('hero_sub')}</p>
                {/* Feature chips */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="flex items-center px-3 py-1 bg-blue-950/80 border border-blue-700 text-blue-200 rounded-lg text-xs font-medium"><Star className="mr-1 w-4 h-4 text-yellow-400" /> {lang === 'vi' ? 'Phát hiện thời gian thực' : 'Real-time Detection'}</span>
                  <span className="flex items-center px-3 py-1 bg-blue-950/80 border border-blue-700 text-blue-200 rounded-lg text-xs font-medium">{lang === 'vi' ? 'Đếm vào/ra' : 'In/Out Counting'}</span>
                  <span className="flex items-center px-3 py-1 bg-blue-950/80 border border-blue-700 text-blue-200 rounded-lg text-xs font-medium">{lang === 'vi' ? 'Shoplifting & Violence' : 'Shoplifting & Violence'}</span>
              </div>
                {/* Micro-stats removed per request */}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isAuthenticated ? (
                  <Link href="/cameras" className="btn-primary btn-lg group">
                    Go to Dashboard
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <Link href="/login" className="btn-primary btn-lg group">
                    {t('cta_get_started')}
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}
                <button 
                  onClick={() => {
                    const demoSection = document.getElementById('demo-section');
                    if (demoSection) {
                      demoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className="btn-outline btn-lg group"
                >
                  <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  {t('cta_watch_demo')}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>{t('perk_free')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>{t('perk_no_setup')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>{t('perk_support')}</span>
                </div>
              </div>

              {/* Trust logos row */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-6 opacity-80 text-slate-300">
                <span className="text-xs">Trusted by teams</span>
                <span className="h-4 w-px bg-white/20" />
                <span className="text-sm">Next.js</span>
                <span className="text-sm">FastAPI</span>
                <span className="text-sm">OpenCV</span>
                <span className="text-sm">Ultralytics</span>
                <span className="text-sm">Postgres/Timescale</span>
                <span className="text-sm">Docker</span>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center space-y-4 mb-16"
          >
            <h2 className="text-4xl font-bold text-slate-900">{t('features_title')}</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">{t('features_sub')}</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -6, boxShadow: '0 8px 24px 0 rgba(37,99,235,.08)' }}
                className="relative text-center space-y-4 p-6 rounded-xl bg-white hover:shadow-xl transition-all duration-300 group cursor-pointer"
              >
                <div className={`w-16 h-16 ${feature.bgColor} rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`w-8 h-8 ${feature.color} group-hover:scale-125 transition-transform duration-300`} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
                <Link href="/features" className="inline-flex items-center gap-1 text-blue-600 font-medium text-sm hover:underline transition-all">
                  Learn more <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center space-y-4 mb-16"
          >
            <h2 className="text-4xl font-bold text-white">{t('stats_title')}</h2>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto">
              {lang === 'vi' 
                ? 'Hệ thống giám sát AI tiên tiến với phát hiện hành vi thời gian thực và phân tích dữ liệu.'
                : 'Advanced AI surveillance system with real-time behavior detection and data analytics.'}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center space-y-2"
              >
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto">
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-blue-100">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo/Screenshots Section */}
      <section id="demo-section" className="py-20 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center space-y-4 mb-12"
          >
            <h2 className="text-4xl font-bold text-white">
              {lang === 'vi' ? 'Xem Demo Hệ Thống' : 'See It In Action'}
            </h2>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto">
              {lang === 'vi' 
                ? 'Khám phá giao diện và tính năng của hệ thống giám sát AI'
                : 'Explore the interface and features of our AI surveillance system'}
            </p>
          </motion.div>

          {/* Demo Images Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {/* Dashboard Screenshot */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
              className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur-sm hover:border-blue-500/50 transition-all duration-300"
            >
              <div className="aspect-video relative bg-slate-900">
                <Image
                  src="/demos/dashboard.png"
                  alt={lang === 'vi' ? 'Bảng điều khiển' : 'Dashboard'}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-16 h-16 text-slate-500" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {lang === 'vi' ? 'Bảng Điều Khiển' : 'Dashboard'}
                </h3>
                <p className="text-sm text-slate-400">
                  {lang === 'vi' ? 'Theo dõi camera và cảnh báo thời gian thực' : 'Real-time camera monitoring and alerts'}
                </p>
              </div>
            </motion.div>

            {/* Behavior Detection Screenshot */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300"
            >
              <div className="aspect-video relative bg-slate-900">
                <Image
                  src="/demos/behavior.png"
                  alt={lang === 'vi' ? 'Phát hiện hành vi' : 'Behavior Detection'}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AlertTriangle className="w-16 h-16 text-slate-500" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {lang === 'vi' ? 'Phát Hiện Hành Vi' : 'Behavior Detection'}
                </h3>
                <p className="text-sm text-slate-400">
                  {lang === 'vi' ? 'Cảnh báo shoplifting và violence' : 'Shoplifting & violence alerts'}
                </p>
              </div>
            </motion.div>

            {/* In/Out Counting Screenshot */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur-sm hover:border-green-500/50 transition-all duration-300"
            >
              <div className="aspect-video relative bg-slate-900">
                <Image
                  src="/demos/inout.png"
                  alt={lang === 'vi' ? 'Đếm vào/ra' : 'In/Out Counting'}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Users className="w-16 h-16 text-slate-500" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {lang === 'vi' ? 'Đếm Vào/Ra' : 'In/Out Counting'}
                </h3>
                <p className="text-sm text-slate-400">
                  {lang === 'vi' ? 'Theo dõi lưu lượng khách hàng' : 'Customer traffic tracking'}
                </p>
              </div>
            </motion.div>
          </div>

          {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Link href="/cameras" className="btn-primary btn-lg group">
                {lang === 'vi' ? 'Đi Tới Bảng Điều Khiển' : 'Go to Dashboard'}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              ) : (
                <Link href="/login" className="btn-primary btn-lg group">
                  {t('cta2_btn_trial')}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <Link href="/" className="flex items-center space-x-2">
                <img src="/logo.svg" alt="AIPS" className="w-8 h-8" />
                <span className="text-xl font-bold text-white">AIPS</span>
              </Link>
              <p className="text-slate-400">
                AI-powered surveillance system for modern retail security and analytics.
              </p>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Product</h3>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Company</h3>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Support</h3>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-slate-700 mt-8 pt-8 text-center text-slate-400">
            <p>&copy; 2024 AIPS. All rights reserved. Built for Capstone Project.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
