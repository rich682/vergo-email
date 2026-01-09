import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { EmailProvider } from "@prisma/client"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"
import { EntityService } from "@/lib/services/entity.service"
import { GroupService } from "@/lib/services/group.service"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const emailAccountId = request.nextUrl.searchParams.get("emailAccountId")
  if (!emailAccountId) {
    return NextResponse.json({ error: "emailAccountId is required" }, { status: 400 })
  }

  const account = await EmailAccountService.getById(emailAccountId, session.user.organizationId)
  if (!account) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 })
  }

  try {
    // Get or create default group for this provider
    const defaultGroupName = account.provider === EmailProvider.GMAIL ? "Gmail Contacts" : "Outlook Contacts"
    const allGroups = await GroupService.findByOrganization(session.user.organizationId)
    let defaultGroup = allGroups.find(g => g.name === defaultGroupName)
    
    if (!defaultGroup) {
      defaultGroup = await GroupService.create({
        name: defaultGroupName,
        organizationId: session.user.organizationId
      })
    }

    let contacts: Array<{ name: string; email: string }> = []
    let syncResult: any
    
    if (account.provider === EmailProvider.GMAIL) {
      const provider = new GmailProvider()
      syncResult = await provider.syncContacts?.(account)
      // Gmail sync is stubbed, contacts will be empty
      if (syncResult && 'contacts' in syncResult) {
        contacts = syncResult.contacts || []
      }
    } else if (account.provider === EmailProvider.MICROSOFT) {
      const provider = new MicrosoftProvider()
      syncResult = await provider.syncContacts?.(account)
      if (syncResult && 'contacts' in syncResult) {
        contacts = syncResult.contacts || []
      }
    } else {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
    }

    // Create or update contacts and assign to default group
    let imported = 0
    let skipped = 0
    
    for (const contact of contacts) {
      try {
        // Find or create entity
        const existing = await EntityService.findByEmail(
          contact.email,
          session.user.organizationId
        )
        
        if (existing) {
          // Contact exists - merge groups (add default group if not present)
          const entityWithGroups = await EntityService.findById(existing.id, session.user.organizationId)
          if (entityWithGroups) {
            const entityWithGroupsTyped = entityWithGroups as typeof entityWithGroups & {
              groups: Array<{ group: { id: string } }>
            }
            const currentGroupIds = entityWithGroupsTyped.groups.map(eg => eg.group.id)
            
            // Only add default group if not already assigned
            if (!currentGroupIds.includes(defaultGroup.id)) {
              await EntityService.addToGroup(existing.id, defaultGroup.id)
            }
          }
          skipped++
        } else {
          // Create new contact with default group
          await EntityService.create({
            firstName: contact.name,
            email: contact.email,
            organizationId: session.user.organizationId,
            groupIds: [defaultGroup.id]
          })
          imported++
        }
      } catch (error: any) {
        console.error(`Error syncing contact ${contact.email}:`, error)
        skipped++
      }
    }

    return NextResponse.json({ 
      imported, 
      skipped, 
      message: `Synced ${imported} new contacts, ${skipped} existing contacts. All assigned to "${defaultGroupName}" group.` 
    })
  } catch (error: any) {
    console.error("Contact sync error:", error)
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 })
  }
}

