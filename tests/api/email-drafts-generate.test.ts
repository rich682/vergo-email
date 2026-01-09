import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { EmailDraftService } from '@/lib/services/email-draft.service'

// Mock dependencies before imports
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      organizationId: 'test-org-id'
    }
  })),
  authOptions: {}
}))

vi.mock('@/lib/services/ai-email-generation.service', () => ({
  AIEmailGenerationService: {
    generateDraft: vi.fn(() => Promise.resolve({
      subject: 'Test Subject',
      body: 'Test Body',
      htmlBody: '<p>Test Body</p>',
      suggestedRecipients: { entityIds: [], groupIds: [] }
    }))
  }
}))

vi.mock('@/inngest/client', () => ({
  inngest: {
    send: vi.fn(() => Promise.reject(new Error('Inngest not available')))
  }
}))

// Import after mocks
import { POST } from '@/app/api/email-drafts/generate/route'

describe('POST /api/email-drafts/generate', () => {
  const testOrgId = 'test-org-id'
  const testUserId = 'test-user-id'
  const testPrompt = 'Test prompt for draft generation'

  beforeEach(async () => {
    // Clean up test drafts
    await prisma.emailDraft.deleteMany({
      where: {
        organizationId: testOrgId,
        idempotencyKey: {
          startsWith: 'test-'
        }
      }
    })
    
    vi.clearAllMocks()
  })

  it('should create draft with idempotency key', async () => {
    const idempotencyKey = 'test-idempotency-1'
    const req = new NextRequest('http://localhost/api/email-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: testPrompt,
        idempotencyKey
      })
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.status).toBe('processing')

    const draft = await prisma.emailDraft.findUnique({
      where: { id: data.id }
    })
    expect(draft?.idempotencyKey).toBe(idempotencyKey)
  })

  it('should return same draft id on duplicate idempotency key (single-thread)', async () => {
    const idempotencyKey = 'test-idempotency-2'
    
    // First request
    const req1 = new NextRequest('http://localhost/api/email-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: testPrompt,
        idempotencyKey
      })
    })
    const response1 = await POST(req1)
    const data1 = await response1.json()
    const draftId1 = data1.id

    // Second request with same key
    const req2 = new NextRequest('http://localhost/api/email-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: testPrompt,
        idempotencyKey
      })
    })
    const response2 = await POST(req2)
    const data2 = await response2.json()
    const draftId2 = data2.id

    // Assert same draft ID
    expect(draftId1).toBe(draftId2)

    // Assert only one draft exists
    const drafts = await prisma.emailDraft.findMany({
      where: {
        idempotencyKey
      }
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].id).toBe(draftId1)
  })

  it('should handle concurrent requests with same idempotency key (race-safe)', async () => {
    const idempotencyKey = 'test-idempotency-3'
    
    // Fire 5 parallel requests
    const requests = Array.from({ length: 5 }, () =>
      POST(new NextRequest('http://localhost/api/email-drafts/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: testPrompt,
          idempotencyKey
        })
      }))
    )

    const responses = await Promise.all(requests)
    const data = await Promise.all(responses.map(r => r.json()))
    const draftIds = data.map(d => d.id)

    // All responses should return the same draft ID
    const uniqueIds = new Set(draftIds)
    expect(uniqueIds.size).toBe(1)

    // Only one draft should exist in DB
    const drafts = await prisma.emailDraft.findMany({
      where: {
        idempotencyKey
      }
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].id).toBe(draftIds[0])
  })

  it('should return terminal status in draft response', async () => {
    // Create draft with terminal status
    const draft = await EmailDraftService.create({
      organizationId: testOrgId,
      userId: testUserId,
      prompt: testPrompt,
      idempotencyKey: 'test-terminal-1',
      aiGenerationStatus: 'timeout'
    })

    // Test that the draft was created with terminal status
    const foundDraft = await prisma.emailDraft.findUnique({
      where: { id: draft.id }
    })

    expect(foundDraft?.aiGenerationStatus).toBe('timeout')
    
    // Test GET endpoint
    const { GET } = await import('@/app/api/email-drafts/[id]/route')
    const req = new NextRequest(`http://localhost/api/email-drafts/${draft.id}`, {
      method: 'GET'
    })
    const response = await GET(req, { params: { id: draft.id } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.aiGenerationStatus).toBe('timeout')
  })

  it('should not treat non-idempotency P2002 as idempotency collision', async () => {
    const findByIdempotencyKeySpy = vi.spyOn(EmailDraftService, 'findByIdempotencyKey')
    
    // Mock EmailDraftService.create to throw P2002 for a different unique constraint
    const originalCreate = EmailDraftService.create
    EmailDraftService.create = vi.fn().mockRejectedValueOnce({
      code: 'P2002',
      meta: {
        target: ['organizationId', 'userId', 'prompt'] // Simulated non-idempotency constraint
      },
      message: 'Unique constraint violation'
    })

    const req = new NextRequest('http://localhost/api/email-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: testPrompt,
        idempotencyKey: 'test-non-idempotency-p2002'
      })
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.code).toBe('CONSTRAINT_ERROR')
    expect(data.error).toBeDefined()
    
    // Verify it did NOT try to fetch by idempotencyKey
    expect(findByIdempotencyKeySpy).not.toHaveBeenCalled()

    EmailDraftService.create = originalCreate
    findByIdempotencyKeySpy.mockRestore()
  })
})

