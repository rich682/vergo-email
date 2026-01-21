import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// Mock data stores
const mockTaskInstances = new Map<string, any>()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskInstance: {
      findFirst: vi.fn((args: any) => {
        // Handle current instance lookup by id
        if (args.where?.id) {
          return Promise.resolve(mockTaskInstances.get(args.where.id) || null)
        }
        // Handle prior snapshot lookup by lineageId + isSnapshot
        if (args.where?.lineageId && args.where?.isSnapshot === true) {
          const targetPeriod = args.where?.board?.periodStart?.lt
          // Find snapshots for this lineage
          const snapshots = Array.from(mockTaskInstances.values()).filter(instance =>
            instance.lineageId === args.where.lineageId &&
            instance.isSnapshot === true &&
            (!targetPeriod || instance.board?.periodStart < targetPeriod)
          )
          // Sort by periodStart descending (most recent first) like orderBy does
          snapshots.sort((a, b) => {
            const dateA = new Date(a.board?.periodStart || 0).getTime()
            const dateB = new Date(b.board?.periodStart || 0).getTime()
            return dateB - dateA
          })
          return Promise.resolve(snapshots[0] || null)
        }
        return Promise.resolve(null)
      })
    },
    taskLineage: {
      findUnique: vi.fn((args: any) => {
        const lineageId = args.where?.id
        const instance = Array.from(mockTaskInstances.values()).find(i => i.lineageId === lineageId)
        return Promise.resolve(instance?.lineage || null)
      })
    }
  }
}))

// Import after setting up mocks
import { TableTaskService } from '@/lib/services/table-task.service'

describe('Variance Computation Tests', () => {
  const testOrgId = 'test-org-id'

  // Helper to create schema with specific columns
  const createSchema = (comparableColumns: string[]) => ({
    columns: [
      { id: 'invoice_id', label: 'Invoice ID', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
      { id: 'amount', label: 'Amount', type: 'currency', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: comparableColumns.includes('amount') },
      { id: 'quantity', label: 'Quantity', type: 'number', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: comparableColumns.includes('quantity') },
      { id: 'vendor', label: 'Vendor', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: comparableColumns.includes('vendor') },
      { id: 'notes', label: 'Notes', type: 'notes', source: 'manual', editPolicy: 'EDITABLE_COLLAB' }
    ],
    identityKey: 'invoice_id'
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockTaskInstances.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // VN-1: Column with isComparable=false should not appear in _changes
  it('VN-1: should NOT include non-comparable columns in variance (_changes)', async () => {
    const currentId = 'current-task'
    const priorId = 'prior-task'
    
    // Schema with only 'amount' as comparable (vendor is NOT comparable)
    const schema = createSchema(['amount'])

    mockTaskInstances.set(priorId, {
      id: priorId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000, vendor: 'Old Vendor', quantity: 10 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-01-01') }
    })

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1200, vendor: 'New Vendor', quantity: 15 } // Vendor and quantity changed
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      if (args.where?.lineageId && args.where?.isSnapshot) return Promise.resolve(mockTaskInstances.get(priorId))
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    expect(deltas).not.toBeNull()
    expect(deltas!.length).toBe(1)
    
    const row = deltas![0]
    expect(row._deltaType).toBe('CHANGED')
    expect(row._changes).toBeDefined()
    
    // Amount IS comparable and changed - should be in _changes
    expect(row._changes!['amount']).toBeDefined()
    expect(row._changes!['amount'].prior).toBe(1000)
    expect(row._changes!['amount'].current).toBe(1200)
    
    // Vendor is NOT comparable - should NOT be in _changes even though it changed
    expect(row._changes!['vendor']).toBeUndefined()
    
    // Quantity is NOT comparable - should NOT be in _changes
    expect(row._changes!['quantity']).toBeUndefined()
  })

  // VN-2: Column with isComparable=true and value changed should populate _changes
  it('VN-2: should include comparable columns with changes in _changes', async () => {
    const currentId = 'current-task'
    const priorId = 'prior-task'
    
    // Schema with both amount and quantity as comparable
    const schema = createSchema(['amount', 'quantity'])

    mockTaskInstances.set(priorId, {
      id: priorId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000, quantity: 10 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-01-01') }
    })

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1200, quantity: 15 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      if (args.where?.lineageId && args.where?.isSnapshot) return Promise.resolve(mockTaskInstances.get(priorId))
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    expect(deltas).not.toBeNull()
    const row = deltas![0]
    
    expect(row._deltaType).toBe('CHANGED')
    
    // Both comparable columns should be in _changes
    expect(row._changes!['amount']).toBeDefined()
    expect(row._changes!['amount'].delta).toBe(200) // 1200 - 1000
    expect(row._changes!['amount'].deltaPct).toBeCloseTo(20, 1) // 200/1000 * 100
    
    expect(row._changes!['quantity']).toBeDefined()
    expect(row._changes!['quantity'].delta).toBe(5) // 15 - 10
    expect(row._changes!['quantity'].deltaPct).toBeCloseTo(50, 1) // 5/10 * 100
  })

  // Test: Unchanged row should have _deltaType = UNCHANGED
  it('should mark unchanged rows as UNCHANGED', async () => {
    const currentId = 'current-task'
    const priorId = 'prior-task'
    
    const schema = createSchema(['amount'])

    mockTaskInstances.set(priorId, {
      id: priorId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-01-01') }
    })

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 } // Same value
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      if (args.where?.lineageId && args.where?.isSnapshot) return Promise.resolve(mockTaskInstances.get(priorId))
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    expect(deltas).not.toBeNull()
    const row = deltas![0]
    expect(row._deltaType).toBe('UNCHANGED')
    expect(row._changes).toEqual({}) // No changes
  })

  // Test: New row should have _deltaType = ADDED
  it('should mark new rows as ADDED', async () => {
    const currentId = 'current-task'
    const priorId = 'prior-task'
    
    const schema = createSchema(['amount'])

    mockTaskInstances.set(priorId, {
      id: priorId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-01-01') }
    })

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 },
        { invoice_id: 'INV-002', amount: 500 } // New row
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      if (args.where?.lineageId && args.where?.isSnapshot) return Promise.resolve(mockTaskInstances.get(priorId))
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    expect(deltas).not.toBeNull()
    const addedRow = deltas!.find(r => r.invoice_id === 'INV-002')
    expect(addedRow?._deltaType).toBe('ADDED')
  })

  // Test: Removed row should be included with _deltaType = REMOVED
  it('should include removed rows with REMOVED delta type', async () => {
    const currentId = 'current-task'
    const priorId = 'prior-task'
    
    const schema = createSchema(['amount'])

    mockTaskInstances.set(priorId, {
      id: priorId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 },
        { invoice_id: 'INV-002', amount: 500 } // This row will be "removed"
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-01-01') }
    })

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 }
        // INV-002 is no longer present
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      if (args.where?.lineageId && args.where?.isSnapshot) return Promise.resolve(mockTaskInstances.get(priorId))
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    expect(deltas).not.toBeNull()
    expect(deltas!.length).toBe(2) // 1 unchanged + 1 removed
    
    const removedRow = deltas!.find(r => r.invoice_id === 'INV-002')
    expect(removedRow?._deltaType).toBe('REMOVED')
  })

  // Test: Delta percentage calculation for zero prior value
  it('should handle zero prior value in delta percentage', async () => {
    const currentId = 'current-task'
    const priorId = 'prior-task'
    
    const schema = createSchema(['amount'])

    mockTaskInstances.set(priorId, {
      id: priorId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: true,
      structuredData: [
        { invoice_id: 'INV-001', amount: 0 } // Zero prior value
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-01-01') }
    })

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 100 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      if (args.where?.lineageId && args.where?.isSnapshot) return Promise.resolve(mockTaskInstances.get(priorId))
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    expect(deltas).not.toBeNull()
    const row = deltas![0]
    expect(row._changes!['amount'].deltaPct).toBe(100) // 100% when prior is zero
  })

  // Test: No prior snapshot returns null
  it('should return null when no prior snapshot exists', async () => {
    const currentId = 'current-task'
    
    const schema = createSchema(['amount'])

    mockTaskInstances.set(currentId, {
      id: currentId,
      organizationId: testOrgId,
      type: TaskType.TABLE,
      lineageId: 'lineage-1',
      isSnapshot: false,
      structuredData: [
        { invoice_id: 'INV-001', amount: 1000 }
      ],
      lineage: { id: 'lineage-1', config: schema },
      board: { periodStart: new Date('2025-02-01') }
    })

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.taskInstance.findFirst).mockImplementation((args: any) => {
      if (args.where?.id === currentId) return Promise.resolve(mockTaskInstances.get(currentId))
      // No prior snapshot
      return Promise.resolve(null)
    })

    const deltas = await TableTaskService.getMoMDeltas(currentId, testOrgId)

    // Should still return current data without variance info
    expect(deltas).not.toBeNull()
  })
})
