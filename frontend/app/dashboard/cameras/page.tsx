'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Dashboard Cameras Page - Redirects to main Cameras page
 * The main /cameras page has full functionality with real API
 */
export default function DashboardCamerasRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/cameras');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <p className="text-slate-600">Redirecting to Camera Management...</p>
      </div>
    </div>
  );
}
