/**
 * Permission Utilities
 * 
 * Centralized permission checking for role-based access control.
 * 
 * Role Model:
 * - ADMIN: Full access to everything
 * - MEMBER: Can only see/edit jobs they own or collaborate on
 * - VIEWER: Read-only access to jobs they own or collaborate on
 */

import { UserRole, Prisma } from "@prisma/client"

/**
 * Routes that require ADMIN role
 */
const ADMIN_ONLY_ROUTES = [
  "/dashboard/settings/team",
  "/dashboard/settings", // Org settings (but not sub-routes like /settings/profile if we add it)
  "/dashboard/databases",
  "/dashboard/contacts",
  "/dashboard/collection",
  "/api/org/settings",
  "/api/org/users",
  "/api/org/team",
  "/api/admin",
  "/api/reports", // Report definitions (templates) are admin-only
  "/api/databases",
  "/api/contacts",
  "/api/collection",
]

/**
 * Routes that are exempt from admin check (even though parent is admin-only)
 */
const ADMIN_EXEMPT_ROUTES: string[] = [
  // Add any sub-routes that should be accessible to non-admins
]

/**
 * Check if a user with the given role can access a route
 */
export function canAccessRoute(role: UserRole | string | undefined, path: string): boolean {
  // Normalize role
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  
  // ADMIN can access everything
  if (normalizedRole === UserRole.ADMIN) {
    return true
  }
  
  // Check if path matches any admin-only route
  for (const adminRoute of ADMIN_ONLY_ROUTES) {
    if (path === adminRoute || path.startsWith(adminRoute + "/")) {
      // Check exemptions
      const isExempt = ADMIN_EXEMPT_ROUTES.some(
        exempt => path === exempt || path.startsWith(exempt + "/")
      )
      if (!isExempt) {
        return false
      }
    }
  }
  
  return true
}

/**
 * Get Prisma where clause to filter jobs by user access
 * 
 * ADMIN: No filter (sees all org jobs)
 * MEMBER/VIEWER: Only jobs where user is owner or collaborator
 */
export function getJobAccessFilter(
  userId: string,
  role: UserRole | string | undefined
): Prisma.TaskInstanceWhereInput | null {
  // Normalize role
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  
  // ADMIN sees all jobs - no filter needed
  if (normalizedRole === UserRole.ADMIN) {
    return null
  }
  
  // MEMBER and VIEWER: filter to owned or collaborated jobs
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } }
    ]
  }
}

/**
 * Check if a user role is read-only (cannot create/edit/delete)
 */
export function isReadOnly(role: UserRole | string | undefined): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  return normalizedRole === UserRole.VIEWER
}

/**
 * Check if user can modify a specific job
 * 
 * ADMIN: Can modify any job
 * MEMBER: Can modify jobs they own
 * VIEWER: Cannot modify any job
 */
export function canModifyJob(
  userId: string,
  role: UserRole | string | undefined,
  jobOwnerId: string
): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  
  // VIEWER cannot modify anything
  if (normalizedRole === UserRole.VIEWER) {
    return false
  }
  
  // ADMIN can modify everything
  if (normalizedRole === UserRole.ADMIN) {
    return true
  }
  
  // MEMBER can modify jobs they own
  return userId === jobOwnerId
}

/**
 * Check if user is an admin
 */
export function isAdmin(role: UserRole | string | undefined): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  return normalizedRole === UserRole.ADMIN
}

/**
 * Get Prisma where clause to filter boards by user access
 * 
 * ADMIN: No filter (sees all org boards)
 * MEMBER/VIEWER: Only boards where user is owner or collaborator
 */
export function getBoardAccessFilter(
  userId: string,
  role: UserRole | string | undefined
): Prisma.BoardWhereInput | null {
  // Normalize role
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  
  // ADMIN sees all boards - no filter needed
  if (normalizedRole === UserRole.ADMIN) {
    return null
  }
  
  // MEMBER and VIEWER: filter to owned or collaborated boards
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } }
    ]
  }
}
