import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Don't mock the module — we're testing the actual implementation
// But we need to control the env variable

describe('getOpenAIClient', () => {
  const originalEnv = process.env.OPENAI_API_KEY

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv
    } else {
      delete process.env.OPENAI_API_KEY
    }
    // Clear module cache so getOpenAIClient re-evaluates
    vi.resetModules()
  })

  it('should throw when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY

    const { getOpenAIClient } = await import('@/lib/utils/openai-client')

    expect(() => getOpenAIClient()).toThrow('OPENAI_API_KEY environment variable is not set')
  })

  it('should return an OpenAI instance when key is set', async () => {
    process.env.OPENAI_API_KEY = 'test-key-123'

    const { getOpenAIClient } = await import('@/lib/utils/openai-client')

    const client = getOpenAIClient()
    expect(client).toBeDefined()
    expect(client.chat).toBeDefined()
    expect(client.chat.completions).toBeDefined()
  })
})
