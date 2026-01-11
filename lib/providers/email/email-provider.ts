import { EmailAccount } from "@prisma/client"

export interface EmailSendParams {
  account: EmailAccount
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
  syncContacts?(account: EmailAccount): Promise<ContactSyncResult>
  refreshToken(account: EmailAccount): Promise<EmailAccount>
}



