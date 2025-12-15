'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { storeApi, cameraApi, type Store, type Camera } from '@/lib/api';
import { useAuth } from './AuthContext';

interface DataContextType {
  stores: Store[];
  cameras: Camera[];
  isLoading: boolean;
  error: string | null;
  refreshStores: () => Promise<void>;
  refreshCameras: () => Promise<void>;
  refreshAll: () => Promise<void>;
  lastUpdated: Date | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const storesLoadingRef = useRef(false);
  const camerasLoadingRef = useRef(false);
  
  // Track active organization to detect switches
  const activeOrgId = user?.active_membership?.organization?.id;

  const refreshStores = useCallback(async () => {
    if (storesLoadingRef.current) return;
    storesLoadingRef.current = true;
    
    try {
      setError(null);
      const data = await storeApi.getStores();
      setStores(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to fetch stores:', err);
      setError(err.message || 'Failed to load stores');
    } finally {
      storesLoadingRef.current = false;
    }
  }, []);

  const refreshCameras = useCallback(async () => {
    if (camerasLoadingRef.current) return;
    camerasLoadingRef.current = true;
    
    try {
      setError(null);
      const data = await cameraApi.getCameras();
      setCameras(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to fetch cameras:', err);
      setError(err.message || 'Failed to load cameras');
    } finally {
      camerasLoadingRef.current = false;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([refreshStores(), refreshCameras()]);
    } finally {
      setIsLoading(false);
    }
  }, [refreshStores, refreshCameras]);

  // Initial load
  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
    }
  }, [isAuthenticated, activeOrgId, refreshAll]);

  // Auto-refresh disabled to prevent camera stream interruptions
  // Users can manually refresh via dashboard/camera page buttons
  // useEffect(() => {
  //   if (!isAuthenticated) return;
  //   const interval = setInterval(() => {
  //     refreshAll();
  //   }, 300000); // 5 minutes if re-enabled
  //   return () => clearInterval(interval);
  // }, [isAuthenticated, refreshAll]);

  return (
    <DataContext.Provider
      value={{
        stores,
        cameras,
        isLoading,
        error,
        refreshStores,
        refreshCameras,
        refreshAll,
        lastUpdated,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

