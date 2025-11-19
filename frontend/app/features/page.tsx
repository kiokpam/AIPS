'use client';

import { motion } from 'framer-motion';
import { 
  Shield, 
  Camera, 
  BarChart3, 
  Brain, 
  Users, 
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';

export default function FeaturesPage() {
  const features = [
    {
      icon: Camera,
      title: 'Real-time Camera Monitoring',
      description: 'Monitor multiple RTSP camera streams in real-time with advanced video analytics and zone detection capabilities.',
      bgColor: 'bg-blue-100',
      color: 'text-blue-600'
    },
    {
      icon: Brain,
      title: 'AI-Powered Analytics',
      description: 'Leverage cutting-edge AI models for people counting, behavior detection, and anomaly recognition.',
      bgColor: 'bg-purple-100',
      color: 'text-purple-600'
    },
    {
      icon: BarChart3,
      title: 'Comprehensive Dashboards',
      description: 'Get insights with detailed analytics on customer flow, occupancy patterns, and behavior monitoring.',
      bgColor: 'bg-green-100',
      color: 'text-green-600'
    },
    {
      icon: AlertTriangle,
      title: 'Smart Alerts',
      description: 'Receive instant notifications for suspicious activities, anomalies, and system events.',
      bgColor: 'bg-red-100',
      color: 'text-red-600'
    },
    {
      icon: Users,
      title: 'Team Management',
      description: 'Manage team members, set permissions, and control access to cameras and dashboards.',
      bgColor: 'bg-orange-100',
      color: 'text-orange-600'
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Enterprise-grade security with role-based access control and encrypted data transmission.',
      bgColor: 'bg-indigo-100',
      color: 'text-indigo-600'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back to Home</span>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Features</h1>
            <div className="w-24"></div> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Powerful Features for Smart Surveillance
          </h2>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Discover how our AI-powered platform transforms video surveillance into actionable insights
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ y: -8, boxShadow: '0 12px 32px 0 rgba(0,0,0,.1)' }}
              className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <div className={`w-16 h-16 ${feature.bgColor} rounded-2xl flex items-center justify-center mb-6`}>
                <feature.icon className={`w-8 h-8 ${feature.color}`} />
              </div>
              <h3 className="text-2xl font-semibold text-slate-900 mb-3">
                {feature.title}
              </h3>
              <p className="text-slate-600 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center text-white"
        >
          <h3 className="text-3xl font-bold mb-4">Ready to Get Started?</h3>
          <p className="text-xl mb-8 opacity-90">
            Experience the power of AI-driven surveillance analytics
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-8 py-4 rounded-lg hover:bg-slate-50 transition-colors shadow-lg"
          >
            Get Started
          </Link>
        </motion.div>
      </main>
    </div>
  );
}

