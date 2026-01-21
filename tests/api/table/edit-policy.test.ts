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
let lastCellUpdate: { taskInstanceId: string; identityValue: any; columnId: string; value: any } | null = null

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
      }),
      update: vi.fn((args: any) => {
        const instance = mockTaskInstances.get(args.where.id)
        if (instance) {
          Object.assign(instance, args.data)
        }
        return Promise.resolve(instance)
      })
    }
  }
}))

vi.mock('@/lib/services/task-instance.service', () => ({
  TaskInstanceService: {
    findById: vi.fn((id: string, orgId: string) => {
      const instance = mockTaskInstances.get(id)
      if (!instance || instance.organizationId !== orgId) return Promise.resolve(null)
      return Promise.resolve(instance)
    })
  }
}))

vi.mock('@/lib/services/table-task.service', () => ({
  TableTaskService: {
    updateCollaborationCell: vi.fn((taskInstanceId: string, orgId: string, identityValue: any, columnId: string, value: any) => {
      const instance = mockTaskInstances.get(taskInstanceId)
      if (!instance) throw new Error('Invalid instance or snapshot is read-only')
      if (instance.isSnapshot) throw new Error('Invalid instance or snapshot is read-only')
      
      const schema = instance.lineage?.config
      const column = schema?.columns?.find((c: any) => c.id === columnId)
      
      if (!column || column.editPolicy !== 'EDITABLE_COLLAB') {
        throw new Error('Column is not editable or does not exist')
      }
      
      const rows = instance.structuredData || []
      const rowIndex = rows.findIndex((r: any) => r[schema.identityKey] === identityValue)
      
      if (rowIndex === -1) {
        throw new Error('Row not found')
      }
      
      lastCellUpdate = { taskInstanceId, identityValue, columnId, value }
      rows[rowIndex][columnId] = value
      return Promise.resolve(instance)
    })
  }
}))

// Import after mocks
import { PATCH } from '@/app/api/task-instances/[id]/table/cell/route'

describe('Two-Plane Edit Policy Tests', () => {
  const testOrgId = 'test-org-id'

  const createTestInstance = (overrides: Partial<any> = {}) => ({
    id: 'test-task-1',
    organizationId: testOrgId,
    type: TaskType.TABLE,
    lineageId: 'lineage-1',
    isSnapshot: false,
    structuredData: [
      { invoice_id: 'INV-001', amount: 1000, notes: 'Initial note', status: 'UNVERIFIED' },
      { invoice_id: 'INV-002', amount: 500, notes: '', status: 'UNVERIFIED' }
    ],
    lineage: {
      id: 'lineage-1',
      config: {
        columns: [
          { id: 'invoice_id', label: 'Invoice ID', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
          { id: 'amount', label: 'Amount', type: 'currency', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: true },
          { id: 'notes', label: 'Notes', type: 'notes', source: 'manual', editPolicy: 'EDITABLE_COLLAB' },
          { id: 'status', label: 'Status', type: 'status', source: 'manual', editPolicy: 'EDITABLE_COLLAB' },
          { id: 'calculated', label: 'Calculated', type: 'number', source: 'computed', editPolicy: 'COMPUTED_ROW' }
        ],
        identityKey: 'invoice_id'
      }
    },
    ...overrides
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockTaskInstances.clear()
    lastCellUpdate = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // EP-1: PATCH /cell with READ_ONLY_IMPORTED column
  it('EP-1: should return 403 when updating READ_ONLY_IMPORTED column', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'amount', // READ_ONLY_IMPORTED
        value: 2000
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('read-only')
  })

  // EP-2: PATCH /cell with COMPUTED_ROW column
  it('EP-2: should return 403 when updating COMPUTED_ROW column', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'calculated', // COMPUTED_ROW
        value: 100
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('read-only')
  })

  // EP-3: PATCH /cell with nonexistent columnId
  it('EP-3: should return 403 or 404 when updating nonexistent column', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'nonexistent_column',
        value: 'test'
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect([403, 404]).toContain(response.status)
  })

  // EP-4: PATCH /cell with EDITABLE_COLLAB column
  it('EP-4: should return 200 when updating EDITABLE_COLLAB column', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'notes', // EDITABLE_COLLAB
        value: 'Updated note'
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(lastCellUpdate?.value).toBe('Updated note')
  })

  // EP-4b: PATCH /cell with EDITABLE_COLLAB status column
  it('EP-4b: should return 200 when updating status column', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'status', // EDITABLE_COLLAB
        value: 'VERIFIED'
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  // EP-5: PATCH /cell when lineage has no schema
  it('EP-5: should return error when lineage has no schema', async () => {
    const taskId = 'test-task-no-schema'
    mockTaskInstances.set(taskId, {
      id: taskId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-2',
      isSnapshot: false,
      structuredData: [{ id: '1', value: 100 }],
      lineage: {
        id: 'lineage-2',
        config: null // No schema
      }
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: '1',
        columnId: 'value',
        value: 200
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(403)
  })

  // Additional: Missing identityValue
  it('should return 400 when identityValue is missing', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        columnId: 'notes',
        value: 'test'
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('identityValue')
  })

  // Additional: Missing columnId
  it('should return 400 when columnId is missing', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        value: 'test'
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('columnId')
  })

  // Additional: Row not found
  it('should return 404 when row with identityValue not found', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'NONEXISTENT-ID',
        columnId: 'notes',
        value: 'test'
      })
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain('Row not found')
  })
})
