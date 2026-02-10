import "next-auth"
import { UserRole } from "@prisma/client"
import type { ModuleAccess } from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: UserRole
      organizationId: string
      moduleAccess: ModuleAccess | null
    }
  }

  interface User {
    id: string
    email: string
    name: string | null
    role: UserRole
    organizationId: string
    moduleAccess: ModuleAccess | null
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
  }
}
