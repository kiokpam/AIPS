'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { vi } from '../i18n/vi';

export type SupportedLang = 'en' | 'vi';
export type Messages = Record<string, string>;

const LOCALES: Record<SupportedLang, Messages> = { en, vi };

type I18nContextValue = {
  lang: SupportedLang;
  setLanguage: (l: SupportedLang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<SupportedLang>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lang');
      if (saved === 'vi' || saved === 'en') return saved;
      // First-visit auto-detect
      const nav = navigator?.language?.toLowerCase() || '';
      if (nav.startsWith('vi')) return 'vi';
    }
    return 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lang', lang);
    }
  }, [lang]);

  const setLanguage = (l: SupportedLang) => setLang(l);

  const t = useMemo(() => {
    const dict = LOCALES[lang] || en;
    return (key: string) => dict[key] ?? key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLanguage, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}


