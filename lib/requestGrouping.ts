/**
 * Request Grouping Helper
 * 
 * Computes deterministic grouping keys for tasks to create Request groups
 * without requiring database schema changes.
 */

export interface RequestGrouping {
  groupKey: string // Normalized lowercase key for grouping
  displayName: string // Pretty title for UI display
  groupType: string // campaignType or "CUSTOM"
}

export interface TaskGroupingInput {
  campaignName: string | null
  campaignType: string | null
  id: string
  latestOutboundSubject?: string | null
}

/**
 * Normalizes a subject line for grouping:
 * - Removes email prefixes (re:, fwd:, fw:)
 * - Collapses whitespace
 * - Lowercases
 * - Truncates to 50 characters
 */
function normalizeSubject(subject: string | null | undefined): string | null {
  if (!subject || typeof subject !== 'string') {
    return null
  }

  let normalized = subject
    .trim()
    // Remove email prefixes (case-insensitive)
    .replace(/^(re:|fwd?:|fw:)\s*/i, '')
    .trim()
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .toLowerCase()

  // Truncate to 50 chars
  if (normalized.length > 50) {
    normalized = normalized.substring(0, 50)
  }

  return normalized || null
}

/**
 * Converts a string to title case for display
 */
function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Gets the grouping key and display name for a task.
 * 
 * Priority order:
 * 1. campaignName (if present and non-empty)
 * 2. campaignType + normalized subject (if campaignType exists)
 * 3. Normalized subject only (if subject exists)
 * 4. Fallback: "untitled"
 */
export function getRequestGrouping(
  task: TaskGroupingInput
): RequestGrouping {
  const { campaignName, campaignType, latestOutboundSubject } = task

  // Priority 1: campaignName
  if (campaignName && campaignName.trim() !== '') {
    const trimmed = campaignName.trim()
    return {
      groupKey: trimmed.toLowerCase(),
      displayName: trimmed,
      groupType: campaignType || 'CUSTOM'
    }
  }

  // Priority 2: campaignType + normalized subject
  const normalizedSubject = normalizeSubject(latestOutboundSubject)
  if (campaignType) {
    if (normalizedSubject) {
      const combined = `${campaignType}: ${normalizedSubject}`
      return {
        groupKey: combined,
        displayName: `${campaignType}: ${toTitleCase(normalizedSubject)}`,
        groupType: campaignType
      }
    } else {
      // campaignType exists but no subject
      return {
        groupKey: `${campaignType.toLowerCase()}: request`,
        displayName: `${campaignType}: Request`,
        groupType: campaignType
      }
    }
  }

  // Priority 3: Normalized subject only
  if (normalizedSubject) {
    return {
      groupKey: normalizedSubject,
      displayName: toTitleCase(normalizedSubject),
      groupType: 'CUSTOM'
    }
  }

  // Priority 4: Fallback
  return {
    groupKey: 'untitled',
    displayName: 'Untitled Request',
    groupType: 'CUSTOM'
  }
}


