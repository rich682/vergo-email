/**
 * Shared types for recipient source selection.
 *
 * Used across form requests, send requests, automations, and compose flows
 * to represent "who" should receive something.
 */

import type { DatabaseRowFilter } from "@/lib/services/database-recipient.service"

export type RecipientSourceMode = "users" | "database"

/**
 * The selection state stored and passed to APIs.
 *
 * - Users mode: `userIds` for explicit picks, `roleSelections` for dynamic
 *   role-based rules that resolve at send time.
 * - Database mode: pick a database, map the email column, optionally filter.
 */
export interface RecipientSourceSelection {
  mode: RecipientSourceMode

  // Users mode
  userIds: string[]
  roleSelections: string[] // e.g. ["MANAGER", "MEMBER"]

  // Database mode
  databaseId?: string
  emailColumnKey?: string
  nameColumnKey?: string
  filters?: DatabaseRowFilter[]
}

/** A resolved recipient ready for sending. */
export interface ResolvedRecipient {
  id: string
  email: string
  name: string
  source: "user" | "database_row"
  role?: string
  personalizationData?: Record<string, string>
}

/** Team member shape returned by /api/org/team. */
export interface TeamMember {
  id: string
  name: string | null
  email: string
  role: string
  isCurrentUser: boolean
}

export const EMPTY_RECIPIENT_SOURCE: RecipientSourceSelection = {
  mode: "users",
  userIds: [],
  roleSelections: [],
}
