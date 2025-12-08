import { SupportedLang } from '@/src/contexts/I18nContext';

// UTC+7 timezone offset in milliseconds
const UTC_PLUS_7_OFFSET = 7 * 60 * 60 * 1000;

/**
 * Convert a date to UTC+7 timezone for display
 * This creates a new Date object that represents the same moment in UTC+7
 */
export function toUTCPlus7(date: Date | number | string): Date {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  // Get UTC timestamp and add 7 hours
  const utcTimestamp = d.getTime() + (d.getTimezoneOffset() * 60 * 1000);
  return new Date(utcTimestamp + UTC_PLUS_7_OFFSET);
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


