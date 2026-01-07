import { google } from "googleapis"
import { EmailConnectionService } from "./email-connection.service"
import { prisma } from "@/lib/prisma"

export class GmailWatchService {
  static async setupWatch(accountId: string): Promise<void> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account || account.provider !== "GMAIL") {
      throw new Error("Account not found or not a Gmail account")
    }

    const oauth2Client = await EmailConnectionService.getGmailClient(accountId)
    if (!oauth2Client) {
      throw new Error("Failed to get Gmail client")
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client })

    // Set up watch - requires a topic name (pub/sub topic)
    // For now, we'll use webhook URL as topic
    const topicName = process.env.GMAIL_PUBSUB_TOPIC || `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-notifications`

    try {
      const response = await gmail.users.watch({
        userId: "me",
        requestBody: {
          topicName: topicName,
          labelIds: ["INBOX"]
        }
      })

      // Store watch expiration (Gmail watches expire after 7 days)
      const expiration = response.data.expiration
      if (expiration) {
        await prisma.connectedEmailAccount.update({
          where: { id: accountId },
          data: {
            // Store expiration in a JSON field or separate table if needed
            // For now, we'll note it in the account
          }
        })
      }
    } catch (error: any) {
      console.error("Error setting up Gmail watch:", error)
      throw error
    }
  }
}









