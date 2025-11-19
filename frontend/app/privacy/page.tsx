'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-10 space-y-6">
        <h1 className="text-3xl font-semibold text-slate-900">Privacy Policy</h1>
        <p className="text-slate-600">
          This overview explains how the AIPS platform handles information. The final, legally binding
          policy will be provided by your organization, but the statements below reflect the current
          product design.
        </p>
        <ol className="list-decimal list-inside space-y-4 text-slate-600">
          <li>
            <span className="font-medium text-slate-700">Captured media:</span> Video and analytics
            data stay within your organization&apos;s infrastructure unless explicitly exported by an
            authorized manager.
          </li>
          <li>
            <span className="font-medium text-slate-700">Account data:</span> We store only the
            information needed to authenticate you (name, email, hashed password) and associate you
            with organizations.
          </li>
          <li>
            <span className="font-medium text-slate-700">Access controls:</span> Role-based
            permissions determine who can view or manage specific resources. Managers can review audit
            logs for user actions.
          </li>
          <li>
            <span className="font-medium text-slate-700">Support requests:</span> Diagnostic logs may
            be generated to resolve issues. These logs never include raw video or personal passwords.
          </li>
        </ol>
        <p className="text-slate-600">
          Contact your administrator if you need a detailed privacy agreement or data processing
          addendum.
        </p>
        <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
          Back to registration
        </Link>
      </div>
    </div>
  );
}

