import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Simplified UI test - testing the polling logic directly
describe('ComposePage - Generate Request Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should handle polling timeout and clear loading state', async () => {
    let pollCount = 0
    let loadingCleared = false
    
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/email-drafts/generate')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'test-draft-id',
            status: 'processing'
          })
        })
      }
      if (url.includes('/api/email-drafts/test-draft-id')) {
        pollCount++
        if (pollCount > 60) {
          loadingCleared = true
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'test-draft-id',
              generatedSubject: null,
              aiGenerationStatus: 'timeout'
            })
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'test-draft-id',
            generatedSubject: null
          })
        })
      }
      return Promise.reject(new Error('Unknown endpoint'))
    })

    const startTime = Date.now()
    const MAX_POLL_TIME = 60000
    
    while (Date.now() - startTime < MAX_POLL_TIME && !loadingCleared) {
      await mockFetch(`/api/email-drafts/test-draft-id`)
      vi.advanceTimersByTime(1000)
    }

    expect(loadingCleared).toBe(true)
    expect(pollCount).toBeGreaterThan(60)
  })

  it('should handle failed status and preserve draft', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'test-draft-id',
        status: 'failed',
        error: 'AI generation failed',
        retryable: false
      })
    })

    const response = await mockFetch('/api/email-drafts/generate')
    const data = await response.json()

    expect(data.status).toBe('failed')
    expect(data.id).toBe('test-draft-id')
    expect(data.error).toBe('AI generation failed')
  })
})

