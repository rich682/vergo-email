import "next-auth"
import { UserRole } from "@prisma/client"
import type { OrgRoleDefaults } from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: UserRole
      organizationId: string
      orgRoleDefaults: OrgRoleDefaults
    }
  }

  interface User {
    id: string
    email: string
    name: string | null
    role: UserRole
    organizationId: string
    orgRoleDefaults: OrgRoleDefaults
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    email: string
    name: string | null
    role: UserRole
    organizationId: string
    orgRoleDefaults: OrgRoleDefaults
    orgRoleDefaultsUpdatedAt?: number
  }
}
