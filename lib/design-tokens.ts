/**
 * Design Tokens - Unified Design System
 * 
 * Source of truth for spacing, colors, typography, shadows, and radii.
 * Based on Bills/Expenses UI patterns.
 */

// ============================================
// SPACING SCALE (8px base)
// ============================================
export const spacing = {
  1: '4px',   // tight inline
  2: '8px',   // default inline, icon gaps
  3: '12px',  // compact sections
  4: '16px',  // card padding, list gaps
  5: '24px',  // section gaps
  6: '32px',  // page sections
  8: '48px',  // major divisions
} as const

// ============================================
// BORDER RADII
// ============================================
export const radii = {
  sm: '4px',      // inputs, small buttons
  md: '6px',      // cards, panels
  lg: '8px',      // modals, large cards
  xl: '12px',     // large panels
  pill: '9999px', // pills, chips, avatars
} as const

// ============================================
// SHADOWS
// ============================================
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.04)',
  md: '0 2px 8px rgba(0,0,0,0.08)',
  lg: '0 4px 16px rgba(0,0,0,0.12)',
  panel: '-4px 0 24px rgba(0,0,0,0.08)',
} as const

// ============================================
// COLORS
// ============================================
export const colors = {
  // Neutrals
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },
  
  // Primary (Green)
  primary: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
  },
  
  // Status colors
  status: {
    active: '#3B82F6',    // blue
    waiting: '#F59E0B',   // amber
    complete: '#22C55E',  // green
    archived: '#6B7280',  // gray
  },
  
  // Semantic
  destructive: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const

// ============================================
// TYPOGRAPHY
// ============================================
export const typography = {
  fontFamily: {
    display: '"NeueHaasDisplay-Roman", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  fontSize: {
    xs: '11px',
    sm: '12px',
    base: '14px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '28px',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
  },
  lineHeight: {
    tight: '1.2',
    snug: '1.3',
    normal: '1.4',
    relaxed: '1.5',
  },
} as const

// ============================================
// STATUS CONFIGURATIONS
// ============================================
export const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  ACTIVE: { label: 'Active', color: '#1D4ED8', bgColor: '#EFF6FF' },
  WAITING: { label: 'Waiting', color: '#B45309', bgColor: '#FFFBEB' },
  COMPLETED: { label: 'Completed', color: '#15803D', bgColor: '#F0FDF4' },
  ARCHIVED: { label: 'Archived', color: '#525252', bgColor: '#F5F5F5' },
}

// Get status config with fallback for custom statuses
export function getStatusStyle(status: string) {
  if (statusConfig[status]) {
    return statusConfig[status]
  }
  // Custom status fallback (purple)
  return {
    label: status,
    color: '#6D28D9',
    bgColor: '#F5F3FF',
  }
}

// ============================================
// CHIP COLOR VARIANTS
// ============================================
export const chipColors = {
  gray: { bg: '#F5F5F5', text: '#525252' },
  blue: { bg: '#EFF6FF', text: '#1D4ED8' },
  green: { bg: '#F0FDF4', text: '#15803D' },
  purple: { bg: '#F5F3FF', text: '#6D28D9' },
  amber: { bg: '#FFFBEB', text: '#B45309' },
  red: { bg: '#FEF2F2', text: '#DC2626' },
} as const

export type ChipColor = keyof typeof chipColors
