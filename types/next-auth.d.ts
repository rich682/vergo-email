import "next-auth"
import { UserRole } from "@prisma/client"
import type { OrgActionPermissions } from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: UserRole
      organizationId: string
      orgActionPermissions: OrgActionPermissions
    }
  }

  interface User {
    id: string
    email: string
    name: string | null
    role: UserRole
    organizationId: string
    orgActionPermissions: OrgActionPermissions
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    email: string
    name: string | null
    role: UserRole
    organizationId: string
    orgActionPermissions: OrgActionPermissions
    permissionsUpdatedAt?: number
  }
}
