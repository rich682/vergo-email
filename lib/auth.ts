import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { UserRole } from "@prisma/client"
import type { ModuleAccess, OrgRoleDefaults } from "@/lib/permissions"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          },
          include: {
            organization: true
          }
        })

        if (!user) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        )

        if (!isPasswordValid) {
          return null
        }

        // Track login timestamp (fire-and-forget, don't block auth)
        prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() }
        }).catch((err) => {
          console.error("[Auth] Failed to update lastLoginAt:", err)
        })

        // Extract org-level role defaults from organization features
        const orgFeatures = (user.organization?.features as Record<string, any>) || {}
        const orgRoleDefaults = orgFeatures.roleDefaultModuleAccess || null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          moduleAccess: (user.moduleAccess as ModuleAccess) || null,
          orgRoleDefaults: orgRoleDefaults as OrgRoleDefaults,
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.role = user.role
        token.organizationId = user.organizationId
        token.moduleAccess = user.moduleAccess || null
        token.orgRoleDefaults = user.orgRoleDefaults || null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string | null
        session.user.role = token.role as UserRole
        session.user.organizationId = token.organizationId as string
        session.user.moduleAccess = (token.moduleAccess as ModuleAccess) || null
        session.user.orgRoleDefaults = (token.orgRoleDefaults as OrgRoleDefaults) || null
      }
      return session
    }
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
