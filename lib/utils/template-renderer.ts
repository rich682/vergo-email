/**
 * Template Rendering Engine
 * 
 * PRD: Personalized Requests with Data Tags
 * 
 * Extracts tags from templates via {{Tag Name}} syntax and replaces them with values
 * from recipient data. Handles normalization for case/space/format variations.
 * 
 * Features:
 * - Case-insensitive tag matching via normalization
 * - Supports {{Tag Name}} and {{tag_name}} syntax
 * - Missing value detection and flagging
 * - Deterministic substitution (same data always produces same output)
 */

import { normalizeTagName } from './csv-parser'

// Re-export normalizeTagName for convenience
export { normalizeTagName }

export interface RenderResult {
  rendered: string
  missingTags: string[] // Array of normalized tag names that were missing
  usedTags: string[] // Array of normalized tag names that were successfully substituted
}

/**
 * Extract all tag names from a template ({{Tag Name}} format)
 */
export function extractTags(template: string): string[] {
  const tagPattern = /\{\{([^}]+)\}\}/g
  const tags: string[] = []
  let match

  while ((match = tagPattern.exec(template)) !== null) {
    const tagName = match[1].trim()
    if (tagName) {
      tags.push(tagName)
    }
  }

  return tags
}

/**
 * Render a template by replacing {{Tag Name}} placeholders with values from data
 */
export function renderTemplate(template: string, data: Record<string, string | null | undefined>): RenderResult {
  const missingTags: string[] = []
  const usedTags: string[] = []
  
  // Normalize all data keys
  const normalizedData: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = normalizeTagName(key)
    normalizedData[normalizedKey] = value?.toString().trim() || ''
  }

  // Extract all tags from template
  const templateTags = extractTags(template)
  const uniqueTemplateTags = [...new Set(templateTags.map(t => normalizeTagName(t)))]

  // Build a map of original tag -> normalized tag for substitution
  const tagMap = new Map<string, string>()
  for (const tag of templateTags) {
    const normalized = normalizeTagName(tag)
    tagMap.set(tag, normalized)
    
    // Check if this tag exists in data
    if (!(normalized in normalizedData) || !normalizedData[normalized]) {
      if (!missingTags.includes(normalized)) {
        missingTags.push(normalized)
      }
    } else {
      if (!usedTags.includes(normalized)) {
        usedTags.push(normalized)
      }
    }
  }

  // Replace tags in template
  let rendered = template
  for (const [originalTag, normalizedTag] of tagMap.entries()) {
    const value = normalizedData[normalizedTag] || ''
    const regex = new RegExp(`\\{\\{\s*${escapeRegex(originalTag)}\s*\\}\\}`, 'gi')
    // If tag is missing or empty, show [MISSING: Tag] placeholder
    if (!value || value.trim() === '') {
      rendered = rendered.replace(regex, `[MISSING: ${originalTag.trim()}]`)
    } else {
      rendered = rendered.replace(regex, value)
    }
  }

  // Post-process to handle missing First Name in greetings gracefully
  // Replace patterns like "Dear [MISSING: First Name]," with "Hello,"
  const firstNameMissingPatterns = [
    /Dear\s+\[MISSING:\s*First\s+Name\]\s*,/gi,
    /Dear\s+\[MISSING:\s*first\s+name\]\s*,/gi,
    /Dear\s+\[MISSING:\s*firstName\]\s*,/gi,
    /Dear\s+\[MISSING:\s*first_name\]\s*,/gi
  ]
  
  for (const pattern of firstNameMissingPatterns) {
    if (pattern.test(rendered)) {
      rendered = rendered.replace(pattern, 'Hello,')
    }
  }

  return {
    rendered,
    missingTags,
    usedTags
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Validate that all required tags exist in data
 */
export function validateTags(
  template: string,
  data: Record<string, string | null | undefined>,
  allowMissing = false
): { valid: boolean; missingTags: string[] } {
  const result = renderTemplate(template, data)
  
  if (allowMissing) {
    return { valid: true, missingTags: result.missingTags }
  }
  
  return {
    valid: result.missingTags.length === 0,
    missingTags: result.missingTags
  }
}

/**
 * Check if rendered content contains unresolved {{...}} tokens
 * Returns the list of unresolved tokens found
 */
export function findUnresolvedTokens(content: string): string[] {
  const tokenPattern = /\{\{([^}]+)\}\}/g
  const tokens: string[] = []
  let match

  while ((match = tokenPattern.exec(content)) !== null) {
    const token = match[0] // Full match including {{ }}
    if (!tokens.includes(token)) {
      tokens.push(token)
    }
  }

  return tokens
}

/**
 * Check if rendered content contains [MISSING: ...] placeholders
 * Returns the list of missing field names
 */
export function findMissingPlaceholders(content: string): string[] {
  const placeholderPattern = /\[MISSING:\s*([^\]]+)\]/g
  const placeholders: string[] = []
  let match

  while ((match = placeholderPattern.exec(content)) !== null) {
    const fieldName = match[1].trim()
    if (!placeholders.includes(fieldName)) {
      placeholders.push(fieldName)
    }
  }

  return placeholders
}

/**
 * Validate that rendered content has no unresolved tokens or missing placeholders
 * Used as final check before sending emails
 */
export function validateRenderedContent(
  subject: string,
  body: string
): { 
  valid: boolean
  unresolvedTokens: string[]
  missingPlaceholders: string[]
} {
  const unresolvedInSubject = findUnresolvedTokens(subject)
  const unresolvedInBody = findUnresolvedTokens(body)
  const unresolvedTokens = [...new Set([...unresolvedInSubject, ...unresolvedInBody])]

  const missingInSubject = findMissingPlaceholders(subject)
  const missingInBody = findMissingPlaceholders(body)
  const missingPlaceholders = [...new Set([...missingInSubject, ...missingInBody])]

  return {
    valid: unresolvedTokens.length === 0 && missingPlaceholders.length === 0,
    unresolvedTokens,
    missingPlaceholders
  }
}

