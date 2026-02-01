import { ConnectedEmailAccount } from "@prisma/client"

export interface EmailAttachment {
  filename: string
  content: Buffer | string  // Buffer or Base64 encoded string
  contentType: string
}

export interface EmailSendParams {
  account: ConnectedEmailAccount
  to: string
  subject: string
  body: string
  htmlBody?: string
  replyTo: string
  // Threading headers for replies
  inReplyTo?: string       // Message-ID of the email being replied to
  references?: string      // Chain of Message-IDs in the thread
  threadId?: string        // Gmail threadId or Microsoft conversationId for threading
  // Attachments
  attachments?: EmailAttachment[]
}

export interface ContactSyncResult {
  imported: number
  skipped: number
  message?: string
}

export interface EmailProviderDriver {
  sendEmail(params: EmailSendParams): Promise<{ messageId: string; providerData: any }>
  syncContacts?(account: ConnectedEmailAccount): Promise<ContactSyncResult>
  refreshToken(account: ConnectedEmailAccount): Promise<ConnectedEmailAccount>
}



