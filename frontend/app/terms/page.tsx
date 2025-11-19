'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-10 space-y-6">
        <h1 className="text-3xl font-semibold text-slate-900">Terms of Service</h1>
        <p className="text-slate-600">
          These draft terms outline the basic expectations for using the AIPS platform. We are still
          refining the legal wording, but the principles below apply whenever you use the system.
        </p>
        <ol className="list-decimal list-inside space-y-4 text-slate-600">
          <li>
            <span className="font-medium text-slate-700">Appropriate use:</span> Use the platform in
            accordance with your organization&apos;s policies and applicable laws.
          </li>
          <li>
            <span className="font-medium text-slate-700">Data protection:</span> Handle captured media
            and analytics responsibly. Only authorized personnel should access sensitive information.
          </li>
          <li>
            <span className="font-medium text-slate-700">Account security:</span> Keep your credentials
            private and notify your manager if you suspect unauthorized access.
          </li>
          <li>
            <span className="font-medium text-slate-700">Service updates:</span> Features may evolve
            over time. We will communicate meaningful changes to organizations in advance.
          </li>
        </ol>
        <p className="text-slate-600">
          For a complete legal agreement, please contact your organization&apos;s administrator.
        </p>
        <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
          Back to registration
        </Link>
      </div>
    </div>
  );
}

