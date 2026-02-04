"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Settings,
  Eye,
  Save,
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Calendar,
  ChevronDown,
  CheckSquare,
  FileUp,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import type { FormField, FormFieldType, FormSettings } from "@/lib/types/form"

// Helper to safely render any value as a string (prevents React error #438)
function safeString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '[object]'
    }
  }
  return String(value)
}

const FIELD_TYPE_CONFIG: Record<
  FormFieldType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  text: { label: "Text", icon: Type },
  longText: { label: "Long Text", icon: AlignLeft },
  number: { label: "Number", icon: Hash },
  currency: { label: "Currency", icon: DollarSign },
  date: { label: "Date", icon: Calendar },
  dropdown: { label: "Dropdown", icon: ChevronDown },
  checkbox: { label: "Checkbox", icon: CheckSquare },
  file: { label: "File Upload", icon: FileUp },
}

// Map database data types to form field types
const DB_TYPE_TO_FIELD_TYPE: Record<string, FormFieldType> = {
  text: "text",
  longText: "longText",
  number: "number",
  currency: "currency",
  date: "date",
  select: "dropdown",
  dropdown: "dropdown",  // Direct mapping for dropdown type
  boolean: "checkbox",
  file: "file",
  // Fallbacks for common variations
  string: "text",
  integer: "number",
  float: "number",
  decimal: "currency",
  datetime: "date",
  bool: "checkbox",
}

interface FormData {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  settings: FormSettings
  databaseId: string | null
  database: {
    id: string
    name: string
    schema: { columns: Array<{ key: string; label: string; dataType: string; dropdownOptions?: string[] }> }
  } | null
}

export default function FormBuilderPage() {
  const router = useRouter()
  const params = useParams()
  
  // Safely extract ID from params
  const rawId = params?.id
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] || '' : ''
  const [form, setForm] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  
  // Ref to track latest form data for auto-save
  const formRef = useRef<FormData | null>(null)
  formRef.current = form

  // Field editor state
  const [editingField, setEditingField] = useState<FormField | null>(null)
  const [isNewField, setIsNewField] = useState(false)
  const [showFieldDialog, setShowFieldDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  // Track selected columns and their required status for bulk add
  const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({})
  const [columnRequired, setColumnRequired] = useState<Record<string, boolean>>({})

  // Fetch form data
  const fetchForm = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/forms/${id}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        console.log('[FormBuilder] API response:', JSON.stringify(data, null, 2))
        // Safely parse JSON fields in case they come as strings
        let fields = data.form.fields || []
        let settings = data.form.settings || {}
        
        // Handle case where Prisma returns JSON as string
        if (typeof fields === 'string') {
          try { fields = JSON.parse(fields) } catch { fields = [] }
        }
        if (typeof settings === 'string') {
          try { settings = JSON.parse(settings) } catch { settings = {} }
        }
        
        // Ensure fields is an array and sanitize each field
        const safeFields = (Array.isArray(fields) ? fields : []).map((f: any) => ({
          key: typeof f.key === 'string' ? f.key : String(f.key || ''),
          label: typeof f.label === 'string' ? f.label : String(f.label || ''),
          type: typeof f.type === 'string' ? f.type : 'text',
          required: Boolean(f.required),
          helpText: typeof f.helpText === 'string' ? f.helpText : undefined,
          options: Array.isArray(f.options) ? f.options.map((o: any) => String(o)) : undefined,
          order: typeof f.order === 'number' ? f.order : 0,
        }))
        
        // Ensure settings has boolean values
        const safeSettings = {
          allowEdit: Boolean(settings?.allowEdit),
          enforceDeadline: Boolean(settings?.enforceDeadline),
        }
        
        // Ensure name and description are strings
        const safeName = typeof data.form.name === 'string' ? data.form.name : String(data.form.name || '')
        const safeDescription = typeof data.form.description === 'string' ? data.form.description : 
                                data.form.description ? String(data.form.description) : null
        
        // Explicitly extract only needed fields - don't spread data.form to avoid unknown properties
        const formState = {
          id: String(data.form.id || ''),
          name: safeName,
          description: safeDescription,
          fields: safeFields,
          settings: safeSettings,
          databaseId: data.form.databaseId || null,
          database: data.form.database ? {
            id: String(data.form.database.id || ''),
            name: String(data.form.database.name || ''),
            schema: {
              columns: Array.isArray(data.form.database.schema?.columns)
                ? data.form.database.schema.columns.map((col: any) => ({
                    key: String(col.key || ''),
                    label: String(col.label || ''),
                    dataType: String(col.dataType || 'text'),
                  }))
                : [],
            },
          } : null,
        }
        console.log('[FormBuilder] Setting form state:', JSON.stringify(formState, null, 2))
        setForm(formState)
      } else if (response.status === 404) {
        router.push("/dashboard/forms")
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/forms"
      }
    } catch (error) {
      console.error("Error fetching form:", error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchForm()
  }, [fetchForm])

  // Refs for debounced auto-save
  const savingRef = useRef(false)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastChangeRef = useRef<number>(0)

  // Save form function using ref to always get latest data
  const saveForm = useCallback(async () => {
    const currentForm = formRef.current
    if (!currentForm) {
      return
    }

    // Prevent duplicate saves using ref (not state, to avoid re-renders)
    if (savingRef.current) {
      return
    }

    try {
      savingRef.current = true
      setSaving(true)
      setSaveError(null)
      
      // Ensure dropdown fields have options array (validation requirement)
      const fieldsToSave = currentForm.fields.map(field => {
        if (field.type === "dropdown" && (!field.options || field.options.length === 0)) {
          // Provide a default option if none exist
          return { ...field, options: ["Option 1"] }
        }
        return field
      })

      const response = await fetch(`/api/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: currentForm.name,
          description: currentForm.description,
          fields: fieldsToSave,
          settings: currentForm.settings,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Save failed:', response.status, errorData)
        throw new Error(errorData.error || errorData.message || "Failed to save")
      }

      setHasChanges(false)
      setSaveError(null)
    } catch (error: any) {
      console.error("Error saving form:", error)
      setSaveError(error.message || "Save failed")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [id])

  // Schedule auto-save (called when form changes)
  const scheduleAutoSave = useCallback(() => {
    // Update last change time
    lastChangeRef.current = Date.now()
    
    // Clear any existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    
    // Set new timer - save 500ms after last change
    saveTimerRef.current = setTimeout(() => {
      saveForm()
    }, 500)
  }, [saveForm])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const updateForm = (updates: Partial<FormData>) => {
    setForm((prev) => (prev ? { ...prev, ...updates } : null))
    setHasChanges(true)
    scheduleAutoSave()
  }

  // Get available database columns that haven't been added as fields yet
  const getAvailableColumns = () => {
    if (!form?.database?.schema?.columns) return []
    const usedKeys = new Set(form.fields.map(f => f.key))
    return form.database.schema.columns.filter(col => !usedKeys.has(col.key))
  }

  const addCustomField = () => {
    const newField: FormField = {
      key: `field_${Date.now()}`,
      label: "New Field",
      type: "text",
      required: false,
      order: form?.fields.length || 0,
    }
    setEditingField(newField)
    setIsNewField(true)
    setShowFieldDialog(true)
  }

  const addSelectedColumns = () => {
    if (!form) return
    const columnsToAdd = getAvailableColumns().filter(col => selectedColumns[col.key])
    if (columnsToAdd.length === 0) return

    const newFields: FormField[] = columnsToAdd.map((col, index) => {
      const fieldType = DB_TYPE_TO_FIELD_TYPE[col.dataType] || "text"
      const field: FormField = {
        key: col.key,
        label: col.label,
        type: fieldType,
        required: columnRequired[col.key] || false,
        order: form.fields.length + index,
      }
      // Copy dropdown options from database column if it's a dropdown type
      if (fieldType === "dropdown" && col.dropdownOptions && col.dropdownOptions.length > 0) {
        field.options = col.dropdownOptions
      }
      return field
    })

    updateForm({ fields: [...form.fields, ...newFields] })
    setShowColumnPicker(false)
    setSelectedColumns({})
    setColumnRequired({})
  }

  const addField = () => {
    // If database is linked and has available columns, show column picker
    // Otherwise, add a custom field directly
    const availableCols = getAvailableColumns()
    if (availableCols.length > 0) {
      setSelectedColumns({})
      setColumnRequired({})
      setShowColumnPicker(true)
    } else {
      addCustomField()
    }
  }

  const editField = (field: FormField) => {
    setEditingField({ ...field })
    setIsNewField(false)
    setShowFieldDialog(true)
  }

  const saveField = () => {
    if (!editingField || !form) return

    let updatedFields: FormField[]
    if (isNewField) {
      updatedFields = [...form.fields, editingField]
    } else {
      updatedFields = form.fields.map((f) =>
        f.key === editingField.key ? editingField : f
      )
    }

    updateForm({ fields: updatedFields })
    setShowFieldDialog(false)
    setEditingField(null)
  }

  const deleteField = (key: string) => {
    if (!form) return
    if (!confirm("Are you sure you want to delete this field?")) return

    const updatedFields = form.fields
      .filter((f) => f.key !== key)
      .map((f, i) => ({ ...f, order: i }))
    updateForm({ fields: updatedFields })
  }

  const moveField = (fromIndex: number, toIndex: number) => {
    if (!form) return

    const fields = [...form.fields]
    const [moved] = fields.splice(fromIndex, 1)
    fields.splice(toIndex, 0, moved)

    const updatedFields = fields.map((f, i) => ({ ...f, order: i }))
    updateForm({ fields: updatedFields })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Form not found</p>
      </div>
    )
  }

  const sortedFields = [...form.fields].sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/forms">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <Input
                  value={safeString(form.name)}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  className="text-lg font-semibold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                  placeholder="Form name"
                />
                <p className="text-sm text-gray-500">
                  {Array.isArray(form.fields) ? form.fields.length : 0} fields
                  {form.database && ` • Linked to ${safeString(form.database.name)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {!saving && saveError && (
                <button
                  onClick={() => { setSaveError(null); saveForm(); }}
                  className="text-sm text-red-500 hover:text-red-600 hover:underline"
                  title={saveError}
                >
                  Save failed - click to retry
                </button>
              )}
              {!saving && !saveError && hasChanges && (
                <span className="text-sm text-orange-500">Saving...</span>
              )}
              {!saving && !saveError && !hasChanges && (
                <span className="text-sm text-green-600">Saved</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsDialog(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Field list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Form Fields</h2>
              <Button
                onClick={addField}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Field
              </Button>
            </div>

            {sortedFields.length === 0 ? (
              <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center">
                <Type className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  No fields yet. Click "Add Field" to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedFields.map((field, index) => {
                  const TypeIcon = FIELD_TYPE_CONFIG[field.type]?.icon || Type
                  return (
                    <div
                      key={field.key}
                      className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3 group hover:border-gray-300"
                    >
                      <button
                        className="cursor-grab text-gray-400 hover:text-gray-600"
                        onMouseDown={(e) => {
                          // Simple drag hint - full DnD would need a library
                          e.currentTarget.style.cursor = "grabbing"
                        }}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <div className="p-2 bg-gray-100 rounded">
                        <TypeIcon className="w-4 h-4 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {safeString(field.label)}
                          {field.required && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {FIELD_TYPE_CONFIG[field.type]?.label || safeString(field.type)}
                          {field.helpText && ` • ${safeString(field.helpText)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {index > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveField(index, index - 1)}
                            className="h-8 w-8 p-0"
                          >
                            ↑
                          </Button>
                        )}
                        {index < sortedFields.length - 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveField(index, index + 1)}
                            className="h-8 w-8 p-0"
                          >
                            ↓
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => editField(field)}
                          className="h-8 px-2"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteField(field.key)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium text-gray-900 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Preview
              </h2>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {safeString(form.name) || "Untitled Form"}
              </h3>
              {form.description && (
                <p className="text-sm text-gray-500 mb-6">{safeString(form.description)}</p>
              )}

              {sortedFields.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  Add fields to see the preview
                </p>
              ) : (
                <div className="space-y-4">
                  {sortedFields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-sm font-medium">
                        {safeString(field.label)}
                        {field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      {field.helpText && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {safeString(field.helpText)}
                        </p>
                      )}
                      <div className="mt-1.5">
                        {field.type === "text" && (
                          <Input placeholder={`Enter ${safeString(field.label).toLowerCase()}`} disabled />
                        )}
                        {field.type === "longText" && (
                          <Textarea
                            placeholder={`Enter ${safeString(field.label).toLowerCase()}`}
                            rows={3}
                            disabled
                          />
                        )}
                        {(field.type === "number" || field.type === "currency") && (
                          <Input
                            type="number"
                            placeholder={field.type === "currency" ? "$0.00" : "0"}
                            disabled
                          />
                        )}
                        {field.type === "date" && (
                          <Input type="date" disabled />
                        )}
                        {field.type === "dropdown" && (
                          <Select disabled>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an option" />
                            </SelectTrigger>
                          </Select>
                        )}
                        {field.type === "checkbox" && (
                          <div className="flex items-center gap-2">
                            <input type="checkbox" disabled className="h-4 w-4" />
                            <span className="text-sm text-gray-500">Yes</span>
                          </div>
                        )}
                        {field.type === "file" && (
                          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                            <FileUp className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                            <p className="text-xs text-gray-500">
                              Click to upload
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white mt-4"
                    disabled
                  >
                    Submit
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Field Editor Dialog */}
      <Dialog open={showFieldDialog} onOpenChange={setShowFieldDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isNewField ? "Add Field" : "Edit Field"}
            </DialogTitle>
          </DialogHeader>
          {editingField && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Label *</Label>
                <Input
                  value={safeString(editingField.label)}
                  onChange={(e) =>
                    setEditingField({ ...editingField, label: e.target.value })
                  }
                  placeholder="Field label"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Field Key</Label>
                <Input
                  value={safeString(editingField.key)}
                  onChange={(e) =>
                    setEditingField({
                      ...editingField,
                      key: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
                    })
                  }
                  placeholder="field_key"
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used for database mapping. Lowercase, underscores only.
                </p>
              </div>

              <div>
                <Label>Type</Label>
                <Select
                  value={safeString(editingField.type)}
                  onValueChange={(value) =>
                    setEditingField({
                      ...editingField,
                      type: value as FormFieldType,
                    })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_CONFIG).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editingField.type === "dropdown" && (
                <div>
                  <Label>Options (one per line)</Label>
                  <Textarea
                    value={editingField.options?.join("\n") || ""}
                    onChange={(e) =>
                      setEditingField({
                        ...editingField,
                        options: e.target.value.split("\n").filter(Boolean),
                      })
                    }
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                    className="mt-1.5"
                    rows={4}
                  />
                </div>
              )}

              <div>
                <Label>Help Text (optional)</Label>
                <Input
                  value={safeString(editingField.helpText) || ""}
                  onChange={(e) =>
                    setEditingField({
                      ...editingField,
                      helpText: e.target.value,
                    })
                  }
                  placeholder="Additional instructions for this field"
                  className="mt-1.5"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Required</Label>
                <Switch
                  checked={editingField.required}
                  onCheckedChange={(checked) =>
                    setEditingField({ ...editingField, required: checked })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFieldDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveField}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isNewField ? "Add Field" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Form Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Allow Editing After Submit</Label>
                <p className="text-xs text-gray-500">
                  Recipients can edit their responses
                </p>
              </div>
              <Switch
                checked={form.settings.allowEdit}
                onCheckedChange={(checked) =>
                  updateForm({
                    settings: { ...form.settings, allowEdit: checked },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Enforce Deadline</Label>
                <p className="text-xs text-gray-500">
                  Block submissions after the deadline
                </p>
              </div>
              <Switch
                checked={form.settings.enforceDeadline}
                onCheckedChange={(checked) =>
                  updateForm({
                    settings: { ...form.settings, enforceDeadline: checked },
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowSettingsDialog(false)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Picker Dialog - shown when database is linked */}
      <Dialog open={showColumnPicker} onOpenChange={setShowColumnPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Fields from Database</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">
              Select which database columns to add as form fields.
            </p>
            <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
                <div className="w-6" />
                <div className="flex-1">Field</div>
                <div className="w-20 text-center">Required</div>
              </div>
              {/* Columns */}
              {getAvailableColumns().map((col) => {
                const fieldType = DB_TYPE_TO_FIELD_TYPE[col.dataType] || "text"
                const isSelected = selectedColumns[col.key] || false
                const isRequired = columnRequired[col.key] || false
                return (
                  <div
                    key={col.key}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isSelected ? "bg-orange-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        setSelectedColumns(prev => ({
                          ...prev,
                          [col.key]: e.target.checked
                        }))
                      }
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{safeString(col.label)}</p>
                      <p className="text-xs text-gray-500">
                        {FIELD_TYPE_CONFIG[fieldType]?.label || "Text"}
                        {fieldType === "dropdown" && col.dropdownOptions && col.dropdownOptions.length > 0 && (
                          <span className="ml-1 text-gray-400">
                            ({col.dropdownOptions.length} options)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="w-20 flex justify-center">
                      <Switch
                        checked={isRequired}
                        onCheckedChange={(checked) =>
                          setColumnRequired(prev => ({
                            ...prev,
                            [col.key]: checked
                          }))
                        }
                        disabled={!isSelected}
                        className={!isSelected ? "opacity-40" : ""}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {getAvailableColumns().length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                All database columns have been added as fields.
              </p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowColumnPicker(false)
                addCustomField()
              }}
            >
              Create Custom Field
            </Button>
            <Button
              onClick={addSelectedColumns}
              disabled={Object.values(selectedColumns).filter(Boolean).length === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Add {Object.values(selectedColumns).filter(Boolean).length || ""} Field{Object.values(selectedColumns).filter(Boolean).length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
