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
let lastImportedRows: any[] = []
let lastLabelsUpdate: any = null

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
          if (args.data.structuredData) {
            instance.structuredData = args.data.structuredData
          }
          if (args.data.labels) {
            lastLabelsUpdate = args.data.labels
            instance.labels = args.data.labels
          }
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
    validateRows: vi.fn(() => Promise.resolve({ valid: true, errors: [] })),
    importRows: vi.fn((taskInstanceId: string, orgId: string, rows: any[]) => {
      const instance = mockTaskInstances.get(taskInstanceId)
      if (!instance) throw new Error('Invalid task instance for table import')
      if (instance.isSnapshot) throw new Error('Cannot modify a historical snapshot')
      
      const schema = instance.lineage?.config
      if (!schema?.identityKey) throw new Error('Table schema or identity key not defined')
      
      const identityKey = schema.identityKey
      const currentRows = instance.structuredData || []
      const collabColIds = schema.columns
        .filter((c: any) => c.editPolicy === 'EDITABLE_COLLAB')
        .map((c: any) => c.id)
      
      // Merge logic: preserve collab data from existing rows
      const mergedRows = rows.map((newRow: any) => {
        const idValue = newRow[identityKey]
        const existingRow = currentRows.find((r: any) => r[identityKey] === idValue)
        
        if (!existingRow) return newRow
        
        const mergedRow = { ...newRow }
        collabColIds.forEach((colId: string) => {
          if (existingRow[colId] !== undefined) {
            mergedRow[colId] = existingRow[colId]
          }
        })
        
        // Preserve _audit.createdAt if exists
        if (existingRow._audit?.createdAt && newRow._audit) {
          mergedRow._audit.createdAt = existingRow._audit.createdAt
        }
        
        return mergedRow
      })
      
      lastImportedRows = mergedRows
      instance.structuredData = mergedRows
      return Promise.resolve(instance)
    })
  },
  TableSchema: {}
}))

// Import after mocks
import { POST } from '@/app/api/task-instances/[id]/table/import/route'

describe('Import Merge Correctness Tests', () => {
  const testOrgId = 'test-org-id'
  const testUserId = 'test-user-id'

  const createTestSchema = () => ({
    columns: [
      { id: 'invoice_id', label: 'Invoice ID', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
      { id: 'amount', label: 'Amount', type: 'currency', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED', isComparable: true },
      { id: 'vendor', label: 'Vendor', type: 'text', source: 'imported', editPolicy: 'READ_ONLY_IMPORTED' },
      { id: 'notes', label: 'Notes', type: 'notes', source: 'manual', editPolicy: 'EDITABLE_COLLAB' },
      { id: 'status', label: 'Status', type: 'status', source: 'manual', editPolicy: 'EDITABLE_COLLAB' }
    ],
    identityKey: 'invoice_id'
  })

  const createTestInstance = (overrides: Partial<any> = {}) => ({
    id: 'test-task-1',
    organizationId: testOrgId,
    type: TaskType.TABLE,
    lineageId: 'lineage-1',
    isSnapshot: false,
    structuredData: [
      { 
        invoice_id: 'INV-001', 
        amount: 1000, 
        vendor: 'Acme Corp',
        notes: 'Important note from PM',
        status: 'VERIFIED',
        _audit: { createdAt: '2025-01-01T00:00:00Z', importedAt: '2025-01-01T00:00:00Z' }
      },
      { 
        invoice_id: 'INV-002', 
        amount: 500, 
        vendor: 'XYZ Inc',
        notes: 'Needs review',
        status: 'FLAGGED',
        _audit: { createdAt: '2025-01-01T00:00:00Z', importedAt: '2025-01-01T00:00:00Z' }
      }
    ],
    labels: {},
    lineage: {
      id: 'lineage-1',
      config: createTestSchema()
    },
    ...overrides
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockTaskInstances.clear()
    lastImportedRows = []
    lastLabelsUpdate = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // IM-1: Re-import with existing collab data
  it('IM-1: should preserve collab values (notes, status) on re-import', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    // Re-import with updated amounts but same invoice IDs
    const newRows = [
      { invoice_id: 'INV-001', amount: 1200, vendor: 'Acme Corp Updated' },
      { invoice_id: 'INV-002', amount: 600, vendor: 'XYZ Inc' }
    ]

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: newRows, filename: 'updated_invoices.csv' })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    
    // Verify collab data was preserved
    const mergedInv001 = lastImportedRows.find((r: any) => r.invoice_id === 'INV-001')
    expect(mergedInv001.notes).toBe('Important note from PM')
    expect(mergedInv001.status).toBe('VERIFIED')
    expect(mergedInv001.amount).toBe(1200) // Updated value
    
    const mergedInv002 = lastImportedRows.find((r: any) => r.invoice_id === 'INV-002')
    expect(mergedInv002.notes).toBe('Needs review')
    expect(mergedInv002.status).toBe('FLAGGED')
  })

  // IM-2: Re-import adds new row, existing unchanged
  it('IM-2: should add new rows while preserving existing rows collab data', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    // Re-import with one new row
    const newRows = [
      { invoice_id: 'INV-001', amount: 1000, vendor: 'Acme Corp' },
      { invoice_id: 'INV-002', amount: 500, vendor: 'XYZ Inc' },
      { invoice_id: 'INV-003', amount: 750, vendor: 'New Vendor' } // New row
    ]

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: newRows })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.rowsAdded).toBe(1) // INV-003 is new
    expect(data.rowsUpdated).toBe(2) // INV-001 and INV-002 existed
    
    // Verify collab data preserved on existing rows
    const inv001 = lastImportedRows.find((r: any) => r.invoice_id === 'INV-001')
    expect(inv001.notes).toBe('Important note from PM')
    
    // Verify new row has no collab data
    const inv003 = lastImportedRows.find((r: any) => r.invoice_id === 'INV-003')
    expect(inv003.notes).toBeUndefined()
  })

  // IM-3: Re-import removes row from source
  it('IM-3: should remove rows not in import (shown as REMOVED in compare)', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    // Re-import with one row missing (INV-002 not included)
    const newRows = [
      { invoice_id: 'INV-001', amount: 1000, vendor: 'Acme Corp' }
    ]

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: newRows })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.rowsRemoved).toBe(1) // INV-002 was removed
    
    // Only INV-001 should remain in imported data
    expect(lastImportedRows.length).toBe(1)
    expect(lastImportedRows[0].invoice_id).toBe('INV-001')
  })

  // IM-4: Re-import preserves _audit.createdAt
  it('IM-4: should preserve original _audit.createdAt timestamp on re-import', async () => {
    const taskId = 'test-task-1'
    const originalCreatedAt = '2025-01-01T00:00:00Z'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    // Re-import same rows
    const newRows = [
      { invoice_id: 'INV-001', amount: 1200, vendor: 'Acme Corp' }
    ]

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: newRows })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })

    expect(response.status).toBe(200)
    
    // The _audit.createdAt should be preserved
    const importedRow = lastImportedRows.find((r: any) => r.invoice_id === 'INV-001')
    expect(importedRow._audit?.createdAt).toBe(originalCreatedAt)
  })

  // IM-5: Re-import updates _audit.lastModifiedAt
  it('IM-5: should update _audit.lastModifiedAt and importedAt on re-import', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const beforeImport = new Date().toISOString()

    const newRows = [
      { invoice_id: 'INV-001', amount: 1200, vendor: 'Acme Corp' }
    ]

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: newRows })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    
    // Import metadata should have current timestamp
    expect(data.importMetadata).toBeDefined()
    expect(new Date(data.importMetadata.lastImportedAt).getTime()).toBeGreaterThanOrEqual(new Date(beforeImport).getTime())
    expect(data.importMetadata.lastImportedBy).toBe(testUserId)
  })

  // Additional: Import with filename tracks source
  it('should track import source filename in metadata', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ 
        rows: [{ invoice_id: 'INV-001', amount: 1000, vendor: 'Acme' }],
        filename: 'january_invoices.csv'
      })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.importMetadata.importSource).toBe('january_invoices.csv')
  })

  // Additional: Validation errors block import
  it('should reject import when validation fails', async () => {
    const taskId = 'test-task-1'
    mockTaskInstances.set(taskId, createTestInstance({ id: taskId }))

    // Mock validation to fail
    const { TableTaskService } = await import('@/lib/services/table-task.service')
    vi.mocked(TableTaskService.validateRows).mockResolvedValueOnce({
      valid: false,
      errors: [
        { row: 0, error: 'Duplicate identity key: INV-001' }
      ]
    })

    const req = new NextRequest(`http://localhost/api/task-instances/${taskId}/table/import`, {
      method: 'POST',
      body: JSON.stringify({ 
        rows: [
          { invoice_id: 'INV-001', amount: 1000 },
          { invoice_id: 'INV-001', amount: 2000 } // Duplicate
        ]
      })
    })

    const response = await POST(req, { params: Promise.resolve({ id: taskId }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
    expect(data.details).toBeDefined()
  })
})
