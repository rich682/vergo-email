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

