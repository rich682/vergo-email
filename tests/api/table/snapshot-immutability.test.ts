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
const mockTaskLineages = new Map<string, any>()

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
    },
    taskLineage: {
      findFirst: vi.fn((args: any) => {
        const id = args.where?.id
        return Promise.resolve(mockTaskLineages.get(id) || null)
      }),
      findUnique: vi.fn((args: any) => {
        const id = args.where?.id
        return Promise.resolve(mockTaskLineages.get(id) || null)
      }),
      update: vi.fn((args: any) => {
        const lineage = mockTaskLineages.get(args.where.id)
        if (lineage) {
          Object.assign(lineage, args.data)
        }
        return Promise.resolve(lineage)
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
      if (!instance || instance.isSnapshot) {
        throw new Error('Invalid instance or snapshot is read-only')
      }
      return Promise.resolve(instance)
    }),
    importRows: vi.fn((taskInstanceId: string, orgId: string, rows: any[]) => {
      const instance = mockTaskInstances.get(taskInstanceId)
      if (!instance) throw new Error('Invalid task instance')
      if (instance.isSnapshot) throw new Error('Cannot modify a historical snapshot')
      instance.structuredData = rows
      return Promise.resolve(instance)
    }),
    validateRows: vi.fn(() => Promise.resolve({ valid: true, errors: [] }))
  },
  TableSchema: {}
}))

// Import after mocks
import { PATCH as PatchCell } from '@/app/api/task-instances/[id]/table/cell/route'
import { POST as PostImport } from '@/app/api/task-instances/[id]/table/import/route'
import { PATCH as PatchSchema } from '@/app/api/task-lineages/[id]/schema/route'

describe('Snapshot Immutability Enforcement Tests', () => {
  const testOrgId = 'test-org-id'

  const createSchema = () => ({
    columns: [
      { id: 'invoice_id', label: 'Invoice ID', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
      { id: 'amount', label: 'Amount', type: 'currency', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: true },
      { id: 'notes', label: 'Notes', type: 'notes', source: 'manual', editPolicy: 'EDITABLE_COLLAB' }
    ],
    identityKey: 'invoice_id'
  })

  const createSnapshotInstance = (id: string) => ({
    id,
    organizationId: testOrgId,
    type: TaskType.TABLE,
    lineageId: 'lineage-1',
    isSnapshot: true, // KEY: This is a snapshot
    structuredData: [
      { invoice_id: 'INV-001', amount: 1000, notes: 'Historical note' }
    ],
    lineage: {
      id: 'lineage-1',
      config: createSchema()
    }
  })

  const createActiveInstance = (id: string) => ({
    id,
    organizationId: testOrgId,
    type: TaskType.TABLE,
    lineageId: 'lineage-1',
    isSnapshot: false, // Active instance
    structuredData: [
      { invoice_id: 'INV-001', amount: 1000, notes: 'Current note' }
    ],
    lineage: {
      id: 'lineage-1',
      config: createSchema()
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockTaskInstances.clear()
    mockTaskLineages.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // SI-1: PATCH /cell on isSnapshot=true instance
  it('SI-1: should return 403 when attempting to edit cell on snapshot', async () => {
    const taskId = 'snapshot-task-1'
    mockTaskInstances.set(taskId, createSnapshotInstance(taskId))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'notes',
        value: 'Trying to modify snapshot'
      })
    })

    const response = await PatchCell(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('snapshot')
  })

  // SI-1b: Verify active instance CAN be edited
  it('SI-1b: should allow cell edit on active (non-snapshot) instance', async () => {
    const taskId = 'active-task-1'
    mockTaskInstances.set(taskId, createActiveInstance(taskId))

    // Override mock to allow edit
    const { TableTaskService } = await import('@/lib/services/table-task.service')
    vi.mocked(TableTaskService.updateCollaborationCell).mockResolvedValueOnce(
      mockTaskInstances.get(taskId)
    )

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({
        identityValue: 'INV-001',
        columnId: 'notes',
        value: 'Updated note on active instance'
      })
    })

    const response = await PatchCell(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  // SI-2: POST /import on isSnapshot=true instance
  it('SI-2: should return 403 when attempting to import to snapshot', async () => {
    const taskId = 'snapshot-task-2'
    mockTaskInstances.set(taskId, createSnapshotInstance(taskId))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({
        rows: [{ invoice_id: 'INV-001', amount: 2000 }]
      })
    })

    const response = await PostImport(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('snapshot')
  })

  // SI-2b: Verify active instance CAN receive imports
  it('SI-2b: should allow import on active (non-snapshot) instance', async () => {
    const taskId = 'active-task-2'
    mockTaskInstances.set(taskId, createActiveInstance(taskId))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({
        rows: [{ invoice_id: 'INV-001', amount: 2000 }],
        filename: 'updated.csv'
      })
    })

    const response = await PostImport(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  // SI-3: PATCH /schema on lineage with snapshot instances (should be allowed)
  it('SI-3: should allow schema update on lineage (affects future instances only)', async () => {
    const lineageId = 'lineage-1'
    mockTaskLineages.set(lineageId, {
      id: lineageId,
      organizationId: testOrgId,
      name: 'Monthly Invoices',
      type: TaskType.TABLE,
      config: createSchema()
    })

    // Also have a snapshot instance using this lineage
    mockTaskInstances.set('snapshot-instance', {
      id: 'snapshot-instance',
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: lineageId,
      isSnapshot: true
    })

    const newSchema = {
      ...createSchema(),
      columns: [
        ...createSchema().columns,
        { id: 'new_column', label: 'New Column', type: 'text', source: 'manual', editPolicy: 'EDITABLE_COLLAB' }
      ]
    }

    const req = new NextRequest(`http://localhost/api/task-lineages/${lineageId}/schema`, {
      method: 'PATCH',
      body: JSON.stringify(newSchema)
    })

    const response = await PatchSchema(req, { params: Promise.resolve({ id: lineageId }) })
    const data = await response.json()

    // Schema update should succeed (it only affects future instances)
    expect(response.status).toBe(200)
    expect(data.schema.columns.length).toBe(4)
  })

  // Additional: Multiple write attempts on snapshot
  it('should consistently reject all write operations on snapshot', async () => {
    const taskId = 'snapshot-task-multi'
    mockTaskInstances.set(taskId, createSnapshotInstance(taskId))

    // Attempt 1: Cell edit
    const cellReq = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({ identityValue: 'INV-001', columnId: 'notes', value: 'test' })
    })
    const cellResponse = await PatchCell(cellReq, { params: Promise.resolve({ id: taskId }) })
    expect(cellResponse.status).toBe(403)

    // Attempt 2: Import
    const importReq = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: [{ invoice_id: 'INV-001', amount: 1000 }] })
    })
    const importResponse = await PostImport(importReq, { params: Promise.resolve({ id: taskId }) })
    expect(importResponse.status).toBe(403)
  })

  // Additional: Verify error message is user-friendly
  it('should return clear error message for snapshot modification attempts', async () => {
    const taskId = 'snapshot-task-msg'
    mockTaskInstances.set(taskId, createSnapshotInstance(taskId))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/cell`, {
      method: 'PATCH',
      body: JSON.stringify({ identityValue: 'INV-001', columnId: 'notes', value: 'test' })
    })

    const response = await PatchCell(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.toLowerCase()).toContain('snapshot')
    // Should not expose internal error details
    expect(data.error).not.toContain('stack')
  })
})
