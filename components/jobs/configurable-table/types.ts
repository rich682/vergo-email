// Column types supported by the configurable table
export type ColumnType = "text" | "status" | "person" | "date" | "notes" | "files" | "responses"

// Column definition structure
export interface ColumnDefinition {
  id: string
  type: ColumnType
  label: string
  width?: number // pixels, optional
  visible: boolean
  order: number
  field?: string // Maps to Job field (e.g., "name", "status", "ownerId", "dueDate", "notes")
  isSystem?: boolean // System columns can't be deleted
}

// Default column configuration
// All default columns are marked as isSystem: true to prevent deletion
// Users can hide columns via the visibility toggle, but cannot delete them
export const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { id: "name", type: "text", label: "Task", width: 280, visible: true, order: 0, field: "name", isSystem: true },
  { id: "status", type: "status", label: "Status", width: 130, visible: true, order: 1, field: "status", isSystem: true },
  { id: "owner", type: "person", label: "Owner", width: 100, visible: true, order: 2, field: "ownerId", isSystem: true },
  { id: "dueDate", type: "date", label: "Due Date", width: 120, visible: true, order: 3, field: "dueDate", isSystem: true },
  { id: "responses", type: "responses", label: "Responses", width: 100, visible: true, order: 4, field: "responses", isSystem: true },
  { id: "notes", type: "notes", label: "Notes", width: 180, visible: true, order: 5, field: "notes", isSystem: true },
  { id: "files", type: "files", label: "Files", width: 100, visible: true, order: 6, field: "collectedItemCount", isSystem: true },
]

// Available column types for adding new columns
export const AVAILABLE_COLUMN_TYPES: { type: ColumnType; label: string; description: string }[] = [
  { type: "text", label: "Text", description: "Single line text field" },
  { type: "status", label: "Status", description: "Status dropdown" },
  { type: "person", label: "Person", description: "Team member picker" },
  { type: "date", label: "Date", description: "Date picker" },
  { type: "notes", label: "Notes", description: "Multi-line text" },
  { type: "files", label: "Files", description: "File attachments" },
  { type: "responses", label: "Responses", description: "Request response tracking" },
]

// Job data structure expected by the table
export interface JobRow {
  id: string
  name: string
  status: string
  ownerId: string
  ownerName: string | null
  ownerEmail: string
  dueDate: string | null
  notes: string | null
  customFields?: Record<string, any>
  collectedItemCount?: number
  taskCount?: number // Number of requests - used for delete/archive logic
  respondedCount?: number // Number of requests that received responses
}

// Team member for person cells
export interface TeamMember {
  id: string
  name: string | null
  email: string
}
