/** Tests for API client */
import { buildWsUrl } from '@/lib/api'

describe('API utilities', () => {
  describe('buildWsUrl', () => {
    beforeEach(() => {
      // Reset environment variables
      delete process.env.NEXT_PUBLIC_API_URL
      delete process.env.NEXT_PUBLIC_NOTIFICATION_URL
    })

    it('should build WebSocket URL from HTTP URL', () => {
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
      
      const result = buildWsUrl('/ws/detections')
      
      // buildWsUrl adds /api prefix for backend WebSockets
      expect(result).toBe('ws://localhost:8000/api/ws/detections')
    })

    it('should build secure WebSocket URL from HTTPS URL', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com'
      
      const result = buildWsUrl('/ws/detections')
      
      // buildWsUrl now resolves API URL dynamically, so it should use the env var
      expect(result).toBe('wss://api.example.com/api/ws/detections')
    })

    it('should use notification service URL for alerts', () => {
      process.env.NEXT_PUBLIC_NOTIFICATION_URL = 'http://notification:8004'
      
      const result = buildWsUrl('/ws/alerts', true)
      
      expect(result).toBe('ws://notification:8004/ws/alerts')
    })

    it('should fallback to backend for alerts if notification URL not set', () => {
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
      delete process.env.NEXT_PUBLIC_NOTIFICATION_URL
      
      const result = buildWsUrl('/ws/alerts', true)
      
      // buildWsUrl adds /api prefix for backend WebSockets
      expect(result).toBe('ws://localhost:8000/api/ws/alerts')
    })
  })
})
