/**
 * Shared trash/soft-delete constants and types
 */

export const TRASH_MODELS = {
  database: { label: "Databases" },
  formDefinition: { label: "Forms" },
  reportDefinition: { label: "Reports" },
  board: { label: "Boards" },
  taskInstance: { label: "Tasks" },
  reconciliationConfig: { label: "Reconciliations" },
  agentDefinition: { label: "Agents" },
  entity: { label: "Contacts" },
  group: { label: "Groups" },
} as const

export type TrashModelKey = keyof typeof TRASH_MODELS
