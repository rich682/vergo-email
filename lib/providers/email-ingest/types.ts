import type { ConnectedEmailAccount, EmailProvider } from "@prisma/client"

export type GmailCursor = { historyId: string }
export type MicrosoftCursor = { deltaLink: string }

export type ProviderCursor = {
  gmail?: GmailCursor
  microsoft?: MicrosoftCursor
}

export interface NormalizedInboundMessage {
  provider: EmailProvider
  accountId: string
  providerId: string
  messageIdHeader?: string | null
  threadId?: string | null
  inReplyTo?: string | null
  references?: string | null
  from: string
  to: string
  replyTo?: string | null
  subject?: string | null
  body?: string | null
  htmlBody?: string | null
  receivedAt?: Date
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
  providerData?: any
}

export interface FetchInboundResult {
  messages: NormalizedInboundMessage[]
  nextCursor?: ProviderCursor | null
  historyPageCount?: number
  bootstrapPerformed?: boolean
}

export interface EmailIngestProvider {
  fetchInboundSinceCursor(
    account: ConnectedEmailAccount,
    cursor: ProviderCursor | null
  ): Promise<FetchInboundResult>
  bootstrapCursor?(
    account: ConnectedEmailAccount
  ): Promise<ProviderCursor | null>
  normalizeRawMessage?(
    account: ConnectedEmailAccount,
    rawMessage: any
  ): Promise<NormalizedInboundMessage | null>
}

