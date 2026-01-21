import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailDraft: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn()
    },
    user: {
      findUnique: vi.fn(() => Promise.resolve({
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        organization: {
          name: 'Test Org'
        },
        signature: null
      }))
    },
    $disconnect: vi.fn()
  }
}))

// Create a shared mock store for drafts (accessible across test runs)
const mockDraftsStore = new Map<string, any>()

// Helper functions for mock implementations
const mockFindByIdempotencyKey = (key: string, orgId?: string) => {
  for (const draft of mockDraftsStore.values()) {
    if (draft.idempotencyKey === key && 
        (orgId === undefined || draft.organizationId === orgId)) {
      return Promise.resolve(draft)
    }
  }
  return Promise.resolve(null)
}

const mockCreate = (data: any) => {
  // Check for existing draft with same idempotencyKey (race condition handling)
  if (data.idempotencyKey) {
    for (const existingDraft of mockDraftsStore.values()) {
      if (existingDraft.idempotencyKey === data.idempotencyKey && 
          existingDraft.organizationId === data.organizationId) {
        // Simulate unique constraint violation for idempotencyKey
        const error: any = new Error('Unique constraint violation')
        error.code = 'P2002'
        error.meta = { target: ['idempotencyKey'] }
        return Promise.reject(error)
      }
    }
  }
  
  const draft = {
    id: `draft-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    organizationId: data.organizationId,
    userId: data.userId,
    prompt: data.prompt,
    idempotencyKey: data.idempotencyKey || null,
    aiGenerationStatus: data.aiGenerationStatus || 'processing',
    generatedSubject: data.generatedSubject || null,
    generatedBody: data.generatedBody || null,
    generatedHtmlBody: data.generatedHtmlBody || null,
    subjectTemplate: data.subjectTemplate || null,
    bodyTemplate: data.bodyTemplate || null,
    htmlBodyTemplate: data.htmlBodyTemplate || null,
    suggestedRecipients: data.suggestedRecipients || { entityIds: [], groupIds: [] },
    suggestedCampaignName: data.suggestedCampaignName || null,
    suggestedCampaignType: data.suggestedCampaignType || null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
  mockDraftsStore.set(draft.id, draft)
  return Promise.resolve(draft)
}

const mockUpdate = (id: string, orgId: string, data: any) => {
  const draft = mockDraftsStore.get(id)
  if (draft && draft.organizationId === orgId) {
    const updated = { ...draft, ...data, updatedAt: new Date() }
    mockDraftsStore.set(id, updated)
    return Promise.resolve(updated)
  }
  return Promise.resolve(null)
}

const mockFindById = (id: string, orgId?: string) => {
  const draft = mockDraftsStore.get(id)
  // If orgId is provided, verify it matches
  if (draft && (orgId === undefined || draft.organizationId === orgId)) {
    return Promise.resolve(draft)
  }
  return Promise.resolve(null)
}

// Mock EmailDraftService with proper implementations
vi.mock('@/lib/services/email-draft.service', () => ({
  EmailDraftService: {
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn()
  }
}))

vi.mock('@/lib/services/ai-email-generation.service', () => ({
  AIEmailGenerationService: {
    generateDraft: vi.fn(() => Promise.resolve({
      subject: 'Test Subject',
      body: 'Test Body',
      htmlBody: '<p>Test Body</p>',
      subjectTemplate: 'Test {{Tag}}',
      bodyTemplate: 'Test body {{Tag}}',
      htmlBodyTemplate: '<p>Test body {{Tag}}</p>',
      suggestedRecipients: { entityIds: [], groupIds: [] },
      suggestedCampaignName: 'Test Campaign',
      suggestedCampaignType: null
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
import { _resetRateLimitForTesting } from '@/lib/utils/rate-limit'
import { EmailDraftService } from '@/lib/services/email-draft.service'

describe('POST /api/email-drafts/generate', () => {
  const testOrgId = 'test-org-id'
  const testUserId = 'test-user-id'
  const testPrompt = 'Test prompt for draft generation'

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDraftsStore.clear()
    _resetRateLimitForTesting() // Reset rate limit between tests
    
    // Set up mock implementations
    const { EmailDraftService } = await import('@/lib/services/email-draft.service')
    vi.mocked(EmailDraftService.findByIdempotencyKey).mockImplementation(mockFindByIdempotencyKey as any)
    vi.mocked(EmailDraftService.create).mockImplementation(mockCreate as any)
    vi.mocked(EmailDraftService.update).mockImplementation(mockUpdate as any)
    vi.mocked(EmailDraftService.findById).mockImplementation(mockFindById as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    mockDraftsStore.clear()
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
    expect(data.status).toBe('completed')
    expect(data.draft).toBeDefined()
    expect(data.draft.generatedSubject).toBe('Test Subject')
    expect(data.draft.generatedBody).toBe('Test Body')

    // Verify draft was created with correct idempotency key
    const draft = await EmailDraftService.findById(data.id, testOrgId)
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

    // Assert only one draft exists (verify via mock store)
    const foundDraft = await EmailDraftService.findByIdempotencyKey(idempotencyKey, testOrgId)
    expect(foundDraft).toBeDefined()
    expect(foundDraft?.id).toBe(draftId1)
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

    // Only one draft should exist (verify via mock store)
    const foundDraft = await EmailDraftService.findByIdempotencyKey(idempotencyKey, testOrgId)
    expect(foundDraft).toBeDefined()
    expect(foundDraft?.id).toBe(draftIds[0])
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
    const foundDraft = await EmailDraftService.findById(draft.id, testOrgId)

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
    vi.mocked(EmailDraftService.create).mockRejectedValueOnce({
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
    
    // Verify it checked idempotencyKey first (normal flow), but did NOT call it again in error handler
    // The route calls findByIdempotencyKey at the start (line 58) when idempotencyKey is provided
    expect(findByIdempotencyKeySpy).toHaveBeenCalledTimes(1) // Called once at start, not again in catch block
    expect(findByIdempotencyKeySpy).toHaveBeenCalledWith('test-non-idempotency-p2002', testOrgId)

    vi.mocked(EmailDraftService.create).mockImplementation(originalCreate as any)
    findByIdempotencyKeySpy.mockRestore()
  })

  it('should return completed status with subject/body immediately', async () => {
    const req = new NextRequest('http://localhost/api/email-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: testPrompt
      })
    })

    const response = await POST(req)
    const data = await response.json()

    if (response.status !== 200) {
      console.error('Test failed with error:', data)
    }
    expect(response.status).toBe(200)
    expect(data.status).toBe('completed')
    expect(data.draft).toBeDefined()
    expect(data.draft.generatedSubject).toBe('Test Subject')
    expect(data.draft.generatedBody).toBe('Test Body')
    
    // Verify draft has terminal status (not processing)
    const draft = await EmailDraftService.findById(data.id, testOrgId)
    expect(draft?.aiGenerationStatus).toBe('complete')
    expect(draft?.generatedSubject).toBe('Test Subject')
    expect(draft?.generatedBody).toBe('Test Body')
  })

  it('should return template fallback on OpenAI timeout and set complete status', async () => {
    const { AIEmailGenerationService } = await import('@/lib/services/ai-email-generation.service')
    
    // Mock OpenAI timeout - service returns template fallback (doesn't throw)
    vi.mocked(AIEmailGenerationService.generateDraft).mockResolvedValueOnce({
      subject: 'Request: Test prompt for draft generation',
      body: testPrompt,
      htmlBody: `<p>${testPrompt}</p>`,
      subjectTemplate: undefined,
      bodyTemplate: undefined,
      htmlBodyTemplate: undefined,
      suggestedRecipients: { entityIds: [], groupIds: [] },
      suggestedCampaignName: 'Test Campaign',
      suggestedCampaignType: undefined
    })

    const req = new NextRequest('http://localhost/api/email-drafts/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: testPrompt
      })
    })

    const response = await POST(req)
    const data = await response.json()

    // Should still return completed (with template fallback)
    expect(response.status).toBe(200)
    expect(data.status).toBe('completed')
    expect(data.draft).toBeDefined()
    expect(data.draft.generatedSubject).toContain('Request:')
    expect(data.draft.generatedBody).toBe(testPrompt)
    
    // Verify draft has complete status (NOT processing)
    const draft = await EmailDraftService.findById(data.id, testOrgId)
    expect(draft?.aiGenerationStatus).toBe('complete')
    expect(draft?.aiGenerationStatus).not.toBe('processing')
  })
})

