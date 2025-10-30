import { SupportedLang } from '@/src/contexts/I18nContext';

export function formatNumber(value: number, lang: SupportedLang): string {
  return new Intl.NumberFormat(lang).format(value);
}

export function formatPercent(value: number, lang: SupportedLang, options: { maximumFractionDigits?: number } = {}): string {
  const { maximumFractionDigits = 1 } = options;
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits }).format(value / 100);
}

export function formatDate(date: Date | number | string, lang: SupportedLang, options: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: '2-digit', ...options }).format(d);
}


