/** Tests for format utilities */
import { formatTime, formatNumber } from '@/src/utils/format'

// Mock the I18n context
const mockLang = 'en' as const

describe('format utilities', () => {
  describe('formatTime', () => {
    it('should format time with hour and minute', () => {
      const date = new Date('2024-01-01T14:30:00Z')
      const result = formatTime(date.toISOString(), mockLang)
      
      // formatTime returns time in format like "02:30 PM" or "14:30"
      expect(result).toMatch(/\d{1,2}:\d{2}/)
    })

    it('should format time with custom options', () => {
      const date = new Date('2024-01-01T14:30:00Z')
      const result = formatTime(date.toISOString(), mockLang, { hour: '2-digit', minute: '2-digit' })
      
      expect(result).toMatch(/\d{1,2}:\d{2}/)
    })
  })

  describe('formatNumber', () => {
    it('should format small numbers', () => {
      expect(formatNumber(123, mockLang)).toBe('123')
      expect(formatNumber(0, mockLang)).toBe('0')
    })

    it('should format large numbers with commas', () => {
      expect(formatNumber(1000, mockLang)).toBe('1,000')
      expect(formatNumber(1234567, mockLang)).toBe('1,234,567')
    })
  })
})
