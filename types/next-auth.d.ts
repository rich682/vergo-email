import "next-auth"
import { UserRole } from "@prisma/client"
import type { ModuleAccess, OrgRoleDefaults } from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: UserRole
      organizationId: string
      moduleAccess: ModuleAccess | null
      orgRoleDefaults: OrgRoleDefaults
    }
  }

  interface User {
    id: string
    email: string
    name: string | null
    role: UserRole
    organizationId: string
    moduleAccess: ModuleAccess | null
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
    moduleAccess: ModuleAccess | null
    orgRoleDefaults: OrgRoleDefaults
  }
}
