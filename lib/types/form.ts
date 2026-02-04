/**
 * Form Types
 * 
 * Type definitions for the Forms module - form definitions, fields, and requests.
 */

// Field types supported by the form builder
export type FormFieldType = 
  | "text"      // Single-line text input
  | "longText"  // Multi-line textarea
  | "number"    // Numeric input
  | "currency"  // Currency input with formatting
  | "date"      // Date picker
  | "dropdown"  // Select from options
  | "checkbox"  // Boolean toggle
  | "file"      // File upload

// Validation rules for form fields
export interface FormFieldValidation {
  min?: number           // Minimum value (for numbers) or length (for text)
  max?: number           // Maximum value (for numbers) or length (for text)
  pattern?: string       // Regex pattern for text fields
  message?: string       // Custom validation error message
}

// Individual form field definition
export interface FormField {
  key: string                    // Unique identifier for the field
  label: string                  // Display label
  type: FormFieldType           // Field type
  required: boolean             // Whether field is mandatory
  helpText?: string             // Help text shown below field
  defaultValue?: unknown        // Default value
  options?: string[]            // Options for dropdown type
  validation?: FormFieldValidation
  order: number                 // Display order
}

// Form-level settings
export interface FormSettings {
  allowEdit: boolean           // Can recipient edit after submit?
  enforceDeadline: boolean     // Block submissions after deadline?
}

// Form request status
export type FormRequestStatus = "PENDING" | "SUBMITTED" | "EXPIRED"

// Form definition as stored in database
export interface FormDefinitionData {
  id: string
  name: string
  description?: string | null
  organizationId: string
  fields: FormField[]
  settings: FormSettings
  databaseId?: string | null
  columnMapping: Record<string, string>  // formFieldKey -> databaseColumnKey
  createdAt: Date
  updatedAt: Date
  createdById: string
}

// Form request as stored in database
export interface FormRequestData {
  id: string
  organizationId: string
  taskInstanceId: string
  formDefinitionId: string
  recipientUserId: string
  status: FormRequestStatus
  submittedAt?: Date | null
  responseData?: Record<string, unknown> | null
  databaseRowIndex?: number | null
  deadlineDate?: Date | null
  remindersEnabled: boolean
  remindersSent: number
  remindersMaxCount: number
  reminderFrequencyHours: number
  nextReminderAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

// Input for creating a new form definition
export interface CreateFormDefinitionInput {
  name: string
  description?: string
  fields?: FormField[]
  settings?: Partial<FormSettings>
  databaseId?: string
  columnMapping?: Record<string, string>
}

// Input for updating a form definition
export interface UpdateFormDefinitionInput {
  name?: string
  description?: string | null
  fields?: FormField[]
  settings?: Partial<FormSettings>
  databaseId?: string | null
  columnMapping?: Record<string, string>
}

// Input for creating form requests (bulk)
export interface CreateFormRequestsInput {
  formDefinitionId: string
  recipientUserIds: string[]
  deadlineDate?: Date
  reminderConfig?: {
    enabled: boolean
    frequencyHours?: number
    maxCount?: number
  }
}

// Form request with related data for display
export interface FormRequestWithDetails extends FormRequestData {
  formDefinition: {
    id: string
    name: string
    fields: FormField[]
  }
  recipientUser: {
    id: string
    name: string | null
    email: string
  }
  taskInstance: {
    id: string
    name: string
  }
}

// Progress stats for form requests on a task
export interface FormRequestProgress {
  total: number
  submitted: number
  pending: number
  expired: number
}

// Default form settings
export const DEFAULT_FORM_SETTINGS: FormSettings = {
  allowEdit: false,
  enforceDeadline: false,
}

// Default reminder config
export const DEFAULT_REMINDER_CONFIG = {
  enabled: false,
  frequencyHours: 72,  // 3 days
  maxCount: 3,
}
