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
  }))
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {}
}))

// Mock TaskType enum - must be inlined due to vitest mock hoisting
vi.mock('@prisma/client', () => ({
  TaskType: {
    GENERIC: 'GENERIC',
    RECONCILIATION: 'RECONCILIATION',
    TABLE: 'TABLE'
  }
}))

// Local reference for test data
const TaskType = {
  GENERIC: 'GENERIC',
  RECONCILIATION: 'RECONCILIATION',
  TABLE: 'TABLE'
}

// Create mock data stores
const mockTaskInstances = new Map<string, any>()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskInstance: {
      findFirst: vi.fn((args: any) => {
        const id = args.where?.id
        const instance = mockTaskInstances.get(id)
        if (!instance) return Promise.resolve(null)
        if (args.where?.organizationId && instance.organizationId !== args.where.organizationId) {
          return Promise.resolve(null)
        }
        return Promise.resolve(instance)
      })
    }
  }
}))

vi.mock('@/lib/services/table-task.service', () => ({
  TableTaskService: {
    getMoMDeltas: vi.fn(() => Promise.resolve([
      { invoice_id: 'INV-001', amount: 1000, _deltaType: 'CHANGED', _changes: { amount: { prior: 900, current: 1000, delta: 100, deltaPct: 11.1 } } },
      { invoice_id: 'INV-002', amount: 500, _deltaType: 'ADDED' },
      { invoice_id: 'INV-003', amount: 200, _deltaType: 'UNCHANGED' }
    ])),
    filterRowsByOwner: vi.fn((rows: any[]) => rows) // Pass-through by default
  },
  TableSchema: {}
}))

// Import after mocks
import { GET } from '@/app/api/task-instances/[id]/table/compare/route'

describe('Compare Gating Tests', () => {
  const testOrgId = 'test-org-id'

  beforeEach(() => {
    vi.clearAllMocks()
    mockTaskInstances.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // CG-1: GET /compare for ad-hoc task (no lineageId)
  it('CG-1: should return 400 for ad-hoc task without lineageId', async () => {
    const taskId = 'adhoc-task-1'
    mockTaskInstances.set(taskId, {
      id: taskId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: null, // Ad-hoc: no lineage
      isSnapshot: false,
      structuredData: [{ invoice_id: 'INV-001', amount: 1000 }],
      lineage: null,
      board: { id: 'board-1', name: 'January 2025', periodStart: new Date('2025-01-01'), cadence: 'AD_HOC' }
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/compare`)
    const response = await GET(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('recurring')
  })

  // CG-2: GET /compare for recurring task with no prior snapshot
  it('CG-2: should return 400 with NO_PRIOR_SNAPSHOT when no prior snapshot exists', async () => {
    const taskId = 'recurring-task-no-prior'
    mockTaskInstances.set(taskId, {
      id: taskId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [{ invoice_id: 'INV-001', amount: 1000 }],
      lineage: {
        id: 'lineage-1',
        config: {
          columns: [
            { id: 'invoice_id', label: 'Invoice ID', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
            { id: 'amount', label: 'Amount', type: 'currency', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: true }
          ],
          identityKey: 'invoice_id'
        }
      },
      board: { id: 'board-1', name: 'January 2025', periodStart: new Date('2025-01-01'), cadence: 'MONTHLY' }
    })

    // Mock prisma to return null for prior snapshot search
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      // First call gets the instance, subsequent calls look for prior snapshot
      if (args.where?.id) {
        return Promise.resolve(mockTaskInstances.get(args.where.id))
      }
      // Prior snapshot query - return null
      if (args.where?.lineageId && args.where?.isSnapshot) {
        return Promise.resolve(null)
      }
      return Promise.resolve(null)
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/compare`)
    const response = await GET(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.reason).toBe('NO_PRIOR_SNAPSHOT')
    expect(data.canCompare).toBe(false)
  })

  // CG-3: GET /compare for recurring task with valid prior snapshot
  it('CG-3: should return 200 with variance data when prior snapshot exists', async () => {
    const taskId = 'recurring-task-with-prior'
    const priorTaskId = 'prior-snapshot-task'
    
    const schema = {
      columns: [
        { id: 'invoice_id', label: 'Invoice ID', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
        { id: 'amount', label: 'Amount', type: 'currency', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: true }
      ],
      identityKey: 'invoice_id'
    }

    mockTaskInstances.set(taskId, {
      id: taskId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [{ invoice_id: 'INV-001', amount: 1000 }],
      lineage: { id: 'lineage-1', config: schema },
      board: { id: 'board-2', name: 'February 2025', periodStart: new Date('2025-02-01'), periodEnd: new Date('2025-02-28'), cadence: 'MONTHLY' }
    })

    mockTaskInstances.set(priorTaskId, {
      id: priorTaskId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [{ invoice_id: 'INV-001', amount: 900 }],
      board: { id: 'board-1', name: 'January 2025', periodStart: new Date('2025-01-01'), periodEnd: new Date('2025-01-31') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id) {
        return Promise.resolve(mockTaskInstances.get(args.where.id))
      }
      // Prior snapshot query - return the prior snapshot
      if (args.where?.lineageId && args.where?.isSnapshot === true) {
        return Promise.resolve(mockTaskInstances.get(priorTaskId))
      }
      return Promise.resolve(null)
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/compare`)
    const response = await GET(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.canCompare).toBe(true)
    expect(data.rows).toBeDefined()
    expect(data.summary).toBeDefined()
    expect(data.priorPeriod).toBeDefined()
    expect(data.currentPeriod).toBeDefined()
  })

  // Additional test: Non-TABLE task type should fail
  it('should return 400 for non-TABLE task type', async () => {
    const taskId = 'generic-task'
    mockTaskInstances.set(taskId, {
      id: taskId,
      organizationId: testOrgId,
      type: TaskType.GENERIC, // Not TABLE
      lineageId: 'lineage-1',
      isSnapshot: false
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/compare`)
    const response = await GET(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('not a Database/Table task')
  })

  // Additional test: Missing schema identity key
  it('should return 400 when schema has no identity key', async () => {
    const taskId = 'task-no-identity-key'
    mockTaskInstances.set(taskId, {
      id: taskId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      lineage: {
        id: 'lineage-1',
        config: {
          columns: [{ id: 'amount', label: 'Amount', type: 'currency' }],
          identityKey: '' // Empty identity key
        }
      },
      board: { id: 'board-1', periodStart: new Date('2025-01-01') }
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/compare`)
    const response = await GET(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('identity key')
  })
})
