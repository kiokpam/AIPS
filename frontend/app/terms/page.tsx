'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, FileText, AlertTriangle, Scale, Clock } from 'lucide-react';

export default function TermsPage() {
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
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
                <p className="text-blue-100 mt-1">Last updated: {lastUpdated}</p>
              </div>
            </div>
          </div>

          {/* Terms Content */}
          <div className="px-8 py-8 space-y-8 text-slate-300">
            {/* Introduction */}
            <section>
              <p className="text-lg leading-relaxed">
                Welcome to AIPS (AI-Powered Store Surveillance). By accessing or using our platform, 
                you agree to be bound by these Terms of Service. Please read them carefully before 
                using our services.
              </p>
            </section>

            {/* Section 1 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">1</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Acceptance of Terms</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>By creating an account or using AIPS, you acknowledge that you have read, understood, and agree to these terms.</p>
                <p>If you are using AIPS on behalf of an organization, you represent that you have authority to bind that organization to these terms.</p>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">2</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Description of Service</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>AIPS provides AI-powered video surveillance analytics including:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Real-time camera monitoring and management</li>
                  <li>People counting and traffic analytics</li>
                  <li>Behavior detection and anomaly alerts</li>
                  <li>Multi-store and multi-user management</li>
                  <li>Historical data and reporting</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">3</span>
                </div>
                <h2 className="text-xl font-semibold text-white">User Accounts & Responsibilities</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p><strong className="text-white">Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.</p>
                <p><strong className="text-white">Accurate Information:</strong> You agree to provide accurate, current, and complete information during registration.</p>
                <p><strong className="text-white">Notification:</strong> You must immediately notify us of any unauthorized use of your account.</p>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">4</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Acceptable Use Policy</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>You agree NOT to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Use the service for any unlawful purpose or in violation of any laws</li>
                  <li>Violate the privacy rights of individuals captured in surveillance footage</li>
                  <li>Share account credentials with unauthorized parties</li>
                  <li>Attempt to reverse engineer, hack, or compromise system security</li>
                  <li>Use the service to harass, abuse, or harm others</li>
                  <li>Interfere with or disrupt the service or servers</li>
                </ul>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">5</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Data Ownership & Privacy</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p><strong className="text-white">Your Data:</strong> You retain ownership of all video footage, analytics data, and configurations you create using AIPS.</p>
                <p><strong className="text-white">Data Processing:</strong> We process your data only to provide and improve our services. See our <Link href="/privacy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link> for details.</p>
                <p><strong className="text-white">Legal Compliance:</strong> You are responsible for ensuring your use of surveillance complies with local privacy laws and regulations.</p>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">6</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Service Availability</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We strive to maintain high availability but do not guarantee uninterrupted service. We may:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Perform maintenance with or without notice</li>
                  <li>Modify or discontinue features</li>
                  <li>Suspend service for security or legal reasons</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">7</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Limitation of Liability</h2>
              </div>
              <div className="pl-11 space-y-3">
                <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-amber-200 text-sm">
                      AIPS is provided "as is" without warranties of any kind. We are not liable for any 
                      indirect, incidental, special, or consequential damages arising from your use of the service.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">8</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Termination</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We may suspend or terminate your account if you violate these terms. Upon termination:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Your access to the service will be revoked</li>
                  <li>You may request export of your data within 30 days</li>
                  <li>We may delete your data after the retention period</li>
                </ul>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">9</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Changes to Terms</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>We may update these terms from time to time. We will notify you of significant changes via email or in-app notification. Continued use after changes constitutes acceptance.</p>
              </div>
            </section>

            {/* Section 10 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">10</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Contact Us</h2>
              </div>
              <div className="pl-11 space-y-3">
                <p>If you have questions about these Terms of Service, please contact:</p>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <p className="text-white font-medium">AIPS Support Team</p>
                  <p className="text-slate-400">Email: support@aips.local</p>
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
                  <Link href="/privacy" className="text-blue-400 hover:text-blue-300 text-sm">
                    Privacy Policy
                  </Link>
                  <Link href="/register" className="text-blue-400 hover:text-blue-300 text-sm">
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
