'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, Eye, Database, Lock, UserCheck, Globe, Bell } from 'lucide-react';

export default function PrivacyPage() {
  const lastUpdated = "December 2024";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link 
            href="/register" 
            className="inline-flex items-center text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to registration
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
          {/* Title Section */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
                <p className="text-emerald-100 mt-1">Last updated: {lastUpdated}</p>
              </div>
            </div>
          </div>

          {/* Privacy Content */}
          <div className="px-8 py-8 space-y-8 text-slate-300">
            {/* Introduction */}
            <section>
              <p className="text-lg leading-relaxed">
                At AIPS, we take your privacy seriously. This Privacy Policy explains how we collect, 
                use, disclose, and safeguard your information when you use our AI-powered store 
                surveillance platform.
              </p>
            </section>

            {/* Quick Overview */}
            <section className="bg-slate-700/30 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Privacy at a Glance</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Database className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Your Data, Your Control</p>
                    <p className="text-sm text-slate-400">Video and analytics stay in your organization</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Lock className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Encrypted & Secure</p>
                    <p className="text-sm text-slate-400">Industry-standard security practices</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Eye className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Minimal Collection</p>
                    <p className="text-sm text-slate-400">We only collect what's necessary</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">No Selling Data</p>
                    <p className="text-sm text-slate-400">We never sell your information</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 1 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">1</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Information We Collect</h2>
              </div>
              <div className="pl-11 space-y-4">
                <div>
                  <h3 className="text-white font-medium mb-2">Account Information</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-slate-400">
                    <li>Name and email address</li>
                    <li>Organization name and details</li>
                    <li>Password (stored as secure hash, never in plain text)</li>
                    <li>Role and permissions within organizations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-white font-medium mb-2">Surveillance Data</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-slate-400">
                    <li>Camera configurations and settings</li>
                    <li>Video streams (processed locally, not stored by AIPS)</li>
                    <li>Analytics data (people counts, behavior detections)</li>
                    <li>Alert history and event logs</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-white font-medium mb-2">Technical Data</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-slate-400">
                    <li>IP address and browser type</li>
                    <li>Device information</li>
                    <li>Usage patterns and feature interactions</li>
                    <li>Error logs for troubleshooting</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">2</span>
                </div>
                <h2 className="text-xl font-semibold text-white">How We Use Your Information</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We use collected information to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong className="text-white">Provide Services:</strong> Operate and maintain the AIPS platform</li>
                  <li><strong className="text-white">Authentication:</strong> Verify your identity and manage access</li>
                  <li><strong className="text-white">Communication:</strong> Send important notifications, alerts, and updates</li>
                  <li><strong className="text-white">Improvement:</strong> Analyze usage to improve features and performance</li>
                  <li><strong className="text-white">Support:</strong> Respond to your requests and troubleshoot issues</li>
                  <li><strong className="text-white">Security:</strong> Detect and prevent fraud or unauthorized access</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">3</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Video & Surveillance Data</h2>
              </div>
              <div className="pl-11 space-y-3">
                <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-emerald-200 font-medium">Your Video Stays Yours</p>
                      <p className="text-emerald-200/80 text-sm mt-1">
                        Video streams are processed in real-time and are NOT stored on AIPS servers. 
                        All footage remains within your own infrastructure or cameras.
                      </p>
                    </div>
                  </div>
                </div>
                <p>For self-hosted deployments, all data remains entirely on your premises.</p>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">4</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Data Sharing & Disclosure</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p className="font-medium text-white">We do NOT sell your personal information.</p>
                <p>We may share information only in these circumstances:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong className="text-white">Within Your Organization:</strong> With other members as permitted by your role</li>
                  <li><strong className="text-white">Service Providers:</strong> Trusted partners who help operate our service (under strict confidentiality)</li>
                  <li><strong className="text-white">Legal Requirements:</strong> When required by law or to protect rights and safety</li>
                  <li><strong className="text-white">Business Transfers:</strong> In connection with a merger or acquisition (with notice)</li>
                </ul>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">5</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Data Security</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We implement industry-standard security measures:</p>
                <div className="grid md:grid-cols-2 gap-3 mt-4">
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <p className="text-white font-medium text-sm">🔐 Encryption</p>
                    <p className="text-slate-400 text-xs">Data encrypted in transit (TLS) and at rest</p>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <p className="text-white font-medium text-sm">🔑 Secure Authentication</p>
                    <p className="text-slate-400 text-xs">Passwords hashed with bcrypt</p>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <p className="text-white font-medium text-sm">🛡️ Access Controls</p>
                    <p className="text-slate-400 text-xs">Role-based permissions system</p>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <p className="text-white font-medium text-sm">📋 Audit Logs</p>
                    <p className="text-slate-400 text-xs">Track user actions for security review</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">6</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Your Rights</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>You have the right to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong className="text-white">Access:</strong> Request a copy of your personal data</li>
                  <li><strong className="text-white">Correction:</strong> Update inaccurate information</li>
                  <li><strong className="text-white">Deletion:</strong> Request deletion of your account and data</li>
                  <li><strong className="text-white">Export:</strong> Download your data in a portable format</li>
                  <li><strong className="text-white">Opt-out:</strong> Unsubscribe from non-essential communications</li>
                </ul>
                <p className="mt-4">To exercise these rights, contact your organization manager or our support team.</p>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">7</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Data Retention</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We retain your information for as long as necessary to provide services and comply with legal obligations:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong className="text-white">Account Data:</strong> Until account deletion + 30 days</li>
                  <li><strong className="text-white">Analytics:</strong> As configured by your organization</li>
                  <li><strong className="text-white">Logs:</strong> 90 days for troubleshooting purposes</li>
                </ul>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">8</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Cookies & Tracking</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We use essential cookies to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Maintain your login session</li>
                  <li>Remember your preferences</li>
                  <li>Ensure security</li>
                </ul>
                <p className="mt-3">We do not use third-party advertising or tracking cookies.</p>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">9</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Changes to This Policy</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We may update this Privacy Policy periodically. We will notify you of significant changes via:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Email notification</li>
                  <li>In-app announcement</li>
                  <li>Updated "Last modified" date</li>
                </ul>
              </div>
            </section>

            {/* Section 10 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">10</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Contact Us</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>For privacy-related questions or concerns:</p>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <p className="text-white font-medium">AIPS Privacy Team</p>
                  <p className="text-slate-400">Email: privacy@aips.local</p>
                </div>
              </div>
            </section>

            {/* Footer */}
            <div className="pt-8 border-t border-slate-700">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-slate-500 text-sm">
                  © {new Date().getFullYear()} AIPS. All rights reserved.
                </p>
                <div className="flex gap-4">
                  <Link href="/terms" className="text-emerald-400 hover:text-emerald-300 text-sm">
                    Terms of Service
                  </Link>
                  <Link href="/register" className="text-emerald-400 hover:text-emerald-300 text-sm">
                    Create Account
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
