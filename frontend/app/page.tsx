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
  Star
} from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/src/contexts/I18nContext';

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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const { lang } = useI18n();

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
      features_rtm_desc: { en: 'Advanced AI-powered surveillance with live video streaming and instant alerts.', vi: 'Giám sát dùng AI với phát video trực tiếp và cảnh báo tức thời.' },
      features_people_title: { en: 'People Counting', vi: 'Đếm số người' },
      features_people_desc: { en: 'Accurate customer counting and traffic analysis with zone-based detection.', vi: 'Đếm khách chính xác và phân tích lưu lượng với vùng phát hiện.' },
      features_behavior_title: { en: 'Behavior Detection', vi: 'Phát hiện hành vi' },
      features_behavior_desc: { en: 'Intelligent anomaly detection for theft prevention and security monitoring.', vi: 'Phát hiện bất thường thông minh để ngăn ngừa trộm cắp và giám sát an ninh.' },
      features_analytics_title: { en: 'Analytics Dashboard', vi: 'Bảng điều khiển phân tích' },
      features_analytics_desc: { en: 'Comprehensive insights and reporting for business optimization.', vi: 'Thông tin chuyên sâu và báo cáo toàn diện để tối ưu hoạt động.' },
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
    { label: 'Status', value: 'Early Access', icon: Shield },
    { label: 'Active Deployments', value: '—', icon: Camera },
    { label: 'Incidents Monitored', value: '—', icon: AlertTriangle },
    { label: 'Accuracy', value: 'Evolving', icon: Star }
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
              <Link href="/login" className="btn-primary btn-md">{t('nav_signin')}</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated gradient background overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_100%_at_10%_10%,rgba(57,179,246,0.18)_0%,rgba(70,69,212,0.15)_40%,rgba(12,16,64,0)_100%)] pointer-events-none animate-gradient-fade z-0" />
        {/* Stars pattern overlay */}
        <div className="absolute inset-0 bg-[url('/noise-dark2.png')] opacity-10 pointer-events-none z-0" />
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
                  <span className="flex items-center px-3 py-1 bg-blue-950/80 border border-blue-700 text-blue-200 rounded-lg text-xs font-medium"><Star className="mr-1 w-4 h-4 text-yellow-400" /> Real-time Detection</span>
                  <span className="flex items-center px-3 py-1 bg-blue-950/80 border border-blue-700 text-blue-200 rounded-lg text-xs font-medium">People Counting</span>
                  <span className="flex items-center px-3 py-1 bg-blue-950/80 border border-blue-700 text-blue-200 rounded-lg text-xs font-medium">Privacy-first</span>
              </div>
                {/* Micro-stats removed per request */}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/login" className="btn-primary btn-lg group">
                  {t('cta_get_started')}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button 
                  onClick={() => setIsVideoPlaying(!isVideoPlaying)}
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
              Join thousands of stores that rely on our AI surveillance system for security and insights.
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
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto">
                  <stat.icon className="w-8 h-8 text-white" />
                </div>
                <div className="text-4xl font-bold text-white">{stat.value}</div>
                <div className="text-blue-100">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <h2 className="text-4xl font-bold text-white">{t('cta2_title')}</h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">{t('cta2_sub')}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login" className="btn-primary btn-lg group">
                {t('cta2_btn_trial')}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button className="btn-outline btn-lg text-white border-white hover:bg-white hover:text-slate-900">{t('cta2_btn_demo')}</button>
            </div>
          </motion.div>
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
