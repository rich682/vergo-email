/**
 * Server-only permission utilities that depend on Prisma.
 *
 * These functions return Prisma where-clause objects and MUST NOT be imported
 * from client components. Use `lib/permissions.ts` for client-safe helpers.
 */

import "server-only"
import { UserRole, Prisma } from "@prisma/client"
import { canPerformAction, type ActionKey, type OrgActionPermissions } from "./permissions"

// ─── Job/Board Access Filters ─────────────────────────────────────────────────

/**
 * Get Prisma where clause to filter jobs by user access.
 *
 * Uses action permissions to determine if user can see all items or only their own.
 * Pass the appropriate view_all action key for the module context:
 * - "tasks:view_all" for task listings
 * - "inbox:view_all" for inbox/requests
 * - "collection:view_all" for collection
 *
 * When viewAllAction is granted → null (no filter, sees everything)
 * Otherwise → only owned, task-collaborated, or board-collaborated jobs
 */
export function getJobAccessFilter(
  userId: string,
  role: UserRole | string | undefined,
  viewAllAction?: ActionKey,
  orgActionPermissions?: OrgActionPermissions
): Prisma.TaskInstanceWhereInput | null {
  // If a viewAllAction is specified, use the action permission system
  if (viewAllAction) {
    if (canPerformAction(role, viewAllAction, orgActionPermissions)) {
      return null
    }
  } else {
    // Legacy fallback: ADMIN and MANAGER see all jobs
    const normalizedRole = role?.toUpperCase() as UserRole | undefined
    if (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER) {
      return null
    }
  }

  // Filter to owned, task-collaborated, or board-collaborated jobs
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } },
      { board: { collaborators: { some: { userId } } } }
    ]
  }
}

/**
 * Get Prisma where clause to filter boards by user access
 *
 * ADMIN/MANAGER: No filter (sees all org boards)
 * MEMBER: Only boards where user is owner or collaborator
 */
export function getBoardAccessFilter(
  userId: string,
  role: UserRole | string | undefined
): Prisma.BoardWhereInput | null {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN and MANAGER see all boards
  if (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER) {
    return null
  }

  // MEMBER: filter to owned or collaborated boards
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } }
    ]
  }
}
