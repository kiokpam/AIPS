import { SupportedLang } from '@/src/contexts/I18nContext';

// UTC+7 timezone offset in milliseconds
const UTC_PLUS_7_OFFSET = 7 * 60 * 60 * 1000;

/**
 * Convert a date to UTC+7 timezone for display
 * Note: This function is now simplified since Intl.DateTimeFormat with timeZone: 'Asia/Bangkok' handles the conversion
 * We just return the date as-is, and let the formatting functions handle timezone conversion
 */
export function toUTCPlus7(date: Date | number | string): Date {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  // Simply return the date - formatting functions use timeZone: 'Asia/Bangkok' to handle conversion
  return d;
}

export function formatNumber(value: number, lang: SupportedLang): string {
  return new Intl.NumberFormat(lang).format(value);
}

export function formatPercent(value: number, lang: SupportedLang, options: { maximumFractionDigits?: number } = {}): string {
  const { maximumFractionDigits = 1 } = options;
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits }).format(value / 100);
}

export function formatDate(date: Date | number | string, lang: SupportedLang, options: Intl.DateTimeFormatOptions = {}): string {
  const d = toUTCPlus7(date);
  return new Intl.DateTimeFormat(lang, { 
    year: 'numeric', 
    month: 'short', 
    day: '2-digit', 
    timeZone: 'Asia/Bangkok', // UTC+7 timezone
    ...options 
  }).format(d);
}

/**
 * Format date and time with UTC+7 timezone
 */
export function formatDateTime(date: Date | number | string, lang: SupportedLang, options: Intl.DateTimeFormatOptions = {}): string {
  const d = toUTCPlus7(date);
  return new Intl.DateTimeFormat(lang, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok', // UTC+7 timezone
    ...options
  }).format(d);
}

/**
 * Format time only with UTC+7 timezone
 */
export function formatTime(date: Date | number | string, lang: SupportedLang, options: Intl.DateTimeFormatOptions = {}): string {
  const d = toUTCPlus7(date);
  return new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok', // UTC+7 timezone
    ...options
  }).format(d);
}


