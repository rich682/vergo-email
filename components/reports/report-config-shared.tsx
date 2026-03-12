// ============================================
// Interfaces
// ============================================

export interface DatabaseOption {
  id: string
  name: string
  rowCount: number
  columnCount: number
}

export interface DatabaseColumn {
  key: string
  label: string
  dataType: string
}

export interface DatabaseDetail {
  id: string
  name: string
  schema: {
    columns: DatabaseColumn[]
  }
  rowCount: number
}
