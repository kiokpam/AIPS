'use client';

import { useState } from 'react';
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
import { useEffect } from 'react';

function LanguageButton() {
  const [lang, setLang] = useState<'en' | 'vi'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lang');
      return (saved === 'vi' ? 'vi' : 'en');
    }
    return 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lang', lang);
    }
  }, [lang]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center cursor-pointer" onClick={() => setLang('vi')}>
        <span className="text-xs font-semibold text-slate-200">VI</span>
        <div className={`h-[3px] w-11 bg-white mt-1 ${lang==='vi' ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
      </div>
      <div className="flex flex-col items-center cursor-pointer" onClick={() => setLang('en')}>
        <span className="text-xs font-semibold text-slate-200">EN</span>
        <div className={`h-[3px] w-11 bg-white mt-1 ${lang==='en' ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [lang, setLang] = useState<'en' | 'vi'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lang');
      return (saved === 'vi' ? 'vi' : 'en');
    }
    return 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const onStorage = (e: StorageEvent) => {
        if (e.key === 'lang' && (e.newValue === 'vi' || e.newValue === 'en')) {
          setLang(e.newValue as 'en' | 'vi');
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }
  }, []);

  const t = (key: string): string => {
    const dict: Record<string, { en: string; vi: string }> = {
      nav_signin: { en: 'Sign In', vi: 'Đăng nhập' },
      hero_title: { en: 'AI-Powered Store Surveillance', vi: 'Giám sát cửa hàng bằng AI' },
      hero_sub: { en: 'Advanced computer vision and machine learning for intelligent retail security, customer analytics, and loss prevention.', vi: 'Thị giác máy tính và máy học nâng cao cho an ninh bán lẻ thông minh, phân tích khách hàng và giảm thất thoát.' },
      cta_get_started: { en: 'Get Started', vi: 'Bắt đầu' },
      cta_watch_demo: { en: 'Watch Demo', vi: 'Xem demo' },
      perk_free: { en: 'Free Trial', vi: 'Dùng thử miễn phí' },
      perk_no_setup: { en: 'No Setup Fees', vi: 'Không phí cài đặt' },
      perk_support: { en: '24/7 Support', vi: 'Hỗ trợ 24/7' },
      features_title: { en: 'Powerful Features for Modern Retail', vi: 'Tính năng mạnh mẽ cho bán lẻ hiện đại' },
      features_sub: { en: 'Our AI-powered surveillance system provides comprehensive security and analytics solutions tailored for retail environments.', vi: 'Hệ thống giám sát dùng AI cung cấp giải pháp an ninh và phân tích toàn diện cho môi trường bán lẻ.' },
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
      title: 'Real-time Monitoring',
      description: 'Advanced AI-powered surveillance with live video streaming and instant alerts.',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      icon: Users,
      title: 'People Counting',
      description: 'Accurate customer counting and traffic analysis with zone-based detection.',
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      icon: Brain,
      title: 'Behavior Detection',
      description: 'Intelligent anomaly detection for theft prevention and security monitoring.',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      icon: BarChart3,
      title: 'Analytics Dashboard',
      description: 'Comprehensive insights and reporting for business optimization.',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ];

  const stats = [
    { label: 'Stores Protected', value: '500+', icon: Shield },
    { label: 'Cameras Monitored', value: '2,000+', icon: Camera },
    { label: 'Threats Prevented', value: '10,000+', icon: AlertTriangle },
    { label: 'Customer Satisfaction', value: '99.8%', icon: Star }
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">{t('hero_title')}</h1>
                <p className="text-xl text-slate-300 leading-relaxed">{t('hero_sub')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
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

              <div className="flex items-center space-x-6 text-sm text-slate-500">
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Live Dashboard</h3>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-slate-500">Live</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-slate-900">1,247</div>
                      <div className="text-sm text-slate-600">Customers Today</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-600">23</div>
                      <div className="text-sm text-slate-600">Active Cameras</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-600">98.5%</div>
                      <div className="text-sm text-slate-600">Accuracy Rate</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-orange-600">3</div>
                      <div className="text-sm text-slate-600">Alerts Today</div>
                    </div>
                  </div>

                  <div className="bg-slate-100 rounded-lg p-4 aspect-video flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Live Camera Feed</p>
                    </div>
                  </div>
                </div>
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
                className="text-center space-y-4 p-6 rounded-xl hover:shadow-lg transition-shadow duration-300"
              >
                <div className={`w-16 h-16 ${feature.bgColor} rounded-2xl flex items-center justify-center mx-auto`}>
                  <feature.icon className={`w-8 h-8 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
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
