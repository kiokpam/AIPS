import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Shield, 
  Eye, 
  Users, 
  Activity, 
  ArrowRight, 
  CheckCircle,
  Star,
  Zap,
  Lock,
  Globe
} from 'lucide-react';

export default function Welcome() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const features = [
    {
      icon: Eye,
      title: 'Real-time Monitoring',
      description: 'Live video feeds with AI-powered analysis and instant alerts'
    },
    {
      icon: Users,
      title: 'People Counting',
      description: 'Advanced YOLOv8 + DeepSORT tracking for accurate crowd analytics'
    },
    {
      icon: Activity,
      title: 'Behavior Detection',
      description: 'I3D/SlowFast models for detecting suspicious activities and anomalies'
    },
    {
      icon: Shield,
      title: 'Secure & Scalable',
      description: 'Cloud-based architecture with enterprise-grade security'
    }
  ];

  const stats = [
    { value: '99.9%', label: 'Uptime' },
    { value: '< 100ms', label: 'Response Time' },
    { value: '24/7', label: 'Monitoring' },
    { value: 'AI-Powered', label: 'Analysis' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50">
      {/* Header */}
      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-primary-600" />
              <span className="ml-2 text-2xl font-bold text-gray-900">AIPS</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="btn btn-secondary btn-md"
              >
                Sign In
              </Link>
              <Link
                href="/login"
                className="btn btn-primary btn-md"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center py-20 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="max-w-4xl mx-auto">
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                AI-Powered
                <span className="text-gradient block">Intelligent Surveillance</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                Advanced surveillance system with real-time AI analysis, people counting, 
                and behavior detection for modern security needs.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/login"
                  className="btn btn-primary btn-lg group"
                >
                  Start Monitoring
                  <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="btn btn-secondary btn-lg">
                  Watch Demo
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-8 py-16 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl font-bold text-primary-600 mb-2">{stat.value}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className={`py-20 transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Powerful Features
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Everything you need for comprehensive surveillance and security management
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div key={index} className="card hover:shadow-medium transition-all duration-300 hover:-translate-y-1">
                    <div className="card-body text-center">
                      <div className="p-3 bg-primary-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <Icon className="h-8 w-8 text-primary-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 text-sm">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Technology Stack */}
          <div className={`py-20 bg-white rounded-2xl shadow-soft transition-all duration-1000 delay-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Built with Modern Technology
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Leveraging cutting-edge AI models and cloud infrastructure for optimal performance
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white mb-4">
                  <Zap className="h-8 w-8 mx-auto" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Models</h3>
                <p className="text-gray-600 text-sm">
                  YOLOv8, DeepSORT, I3D, SlowFast for advanced computer vision
                </p>
              </div>

              <div className="text-center">
                <div className="p-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-xl text-white mb-4">
                  <Globe className="h-8 w-8 mx-auto" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Cloud Infrastructure</h3>
                <p className="text-gray-600 text-sm">
                  Scalable, secure, and reliable cloud-based architecture
                </p>
              </div>

              <div className="text-center">
                <div className="p-4 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl text-white mb-4">
                  <Lock className="h-8 w-8 mx-auto" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise Security</h3>
                <p className="text-gray-600 text-sm">
                  JWT authentication, encrypted communications, and secure APIs
                </p>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className={`py-20 text-center transition-all duration-1000 delay-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="max-w-3xl mx-auto">
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Ready to Secure Your Business?
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Join thousands of businesses already using AIPS for intelligent surveillance
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/login"
                  className="btn btn-primary btn-lg group"
                >
                  Get Started Now
                  <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="btn btn-secondary btn-lg">
                  Contact Sales
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Shield className="h-6 w-6 text-primary-400" />
                <span className="ml-2 text-xl font-bold">AIPS</span>
              </div>
              <p className="text-gray-400 text-sm">
                AI-Powered Intelligent Surveillance System for modern security needs.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
            <p>&copy; 2024 AIPS. All rights reserved. AI-Powered Intelligent Surveillance System.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
