import { ConnectedEmailAccount } from "@prisma/client"

export interface EmailSendParams {
  account: ConnectedEmailAccount
  to: string
  subject: string
  body: string
  htmlBody?: string
  replyTo: string
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



