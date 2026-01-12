/**
 * Humanize Utility Functions
 * 
 * Converts technical identifiers into human-readable labels
 */

// Common acronyms to preserve in uppercase
const ACRONYMS = new Set(['ID', 'URL', 'API', 'PDF', 'CSV', 'SSN', 'EIN', 'TIN', 'W9', 'COI'])

/**
 * Convert a state key or field name to a human-readable label
 * 
 * Examples:
 * - "unpaid_invoice_amount" -> "Unpaid Invoice Amount"
 * - "due_date" -> "Due Date"
 * - "invoice_id" -> "Invoice ID"
 * - "firstName" -> "First Name"
 * - "lastName" -> "Last Name"
 */
export function humanizeStateKey(key: string): string {
  if (!key) return ''
  
  // Replace underscores and camelCase with spaces
  let result = key
    // Handle camelCase: insert space before uppercase letters
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Replace underscores with spaces
    .replace(/_/g, ' ')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    .trim()
  
  // Title case each word, preserving acronyms
  result = result
    .split(' ')
    .map(word => {
      const upper = word.toUpperCase()
      if (ACRONYMS.has(upper)) {
        return upper
      }
      // Title case: first letter uppercase, rest lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
  
  return result
}

/**
 * Convert a human-readable label back to a key format
 * 
 * Examples:
 * - "Unpaid Invoice Amount" -> "unpaid_invoice_amount"
 * - "Due Date" -> "due_date"
 */
export function dehumanizeToKey(label: string): string {
  if (!label) return ''
  
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

/**
 * Format a number as currency
 */
export function formatCurrency(value: number | string, currency = 'USD'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(num)
}

/**
 * Format a date string to a human-readable format
 */
export function formatDate(dateStr: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(date.getTime())) return String(dateStr)
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
  
  return date.toLocaleDateString('en-US', options || defaultOptions)
}
