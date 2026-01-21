import { createHash } from "crypto"
import { ConnectedEmailAccount, EmailProvider } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { EmailReceptionService } from "./email-reception.service"
import {
  NormalizedInboundMessage,
  ProviderCursor,
} from "@/lib/providers/email-ingest/types"
import { GmailIngestProvider } from "@/lib/providers/email-ingest/gmail-ingest.provider"
import { MicrosoftIngestProvider } from "@/lib/providers/email-ingest/microsoft-ingest.provider"
import { logger } from "@/lib/logger"

// Create service-specific logger
const log = logger.child({ service: "EmailSyncService" })

type SyncSummary = {
  accountsProcessed: number
  messagesFetched: number
  repliesPersisted: number
  errors: number
}

type AccountSyncResult = {
  messagesFetched: number
  repliesPersisted: number
  skipped: number
  errors: number
}

export class EmailSyncService {
  private static providerMap: Record<
    EmailProvider,
    GmailIngestProvider | MicrosoftIngestProvider | null
  > = {
    GMAIL: new GmailIngestProvider(),
    MICROSOFT: new MicrosoftIngestProvider(),
    GENERIC_SMTP: null,
  }

  /**
   * Sync all Gmail accounts.
   */
  static async syncGmailAccounts(): Promise<SyncSummary> {
    return this.syncAccountsByProvider("GMAIL")
  }

  /**
   * Sync all Microsoft/Outlook accounts.
   */
  static async syncMicrosoftAccounts(): Promise<SyncSummary> {
    return this.syncAccountsByProvider("MICROSOFT")
  }

  /**
   * Sync all email accounts across all providers.
   */
  static async syncAllAccounts(): Promise<SyncSummary> {
    const gmailSummary = await this.syncGmailAccounts()
    const microsoftSummary = await this.syncMicrosoftAccounts()

    return {
      accountsProcessed: gmailSummary.accountsProcessed + microsoftSummary.accountsProcessed,
      messagesFetched: gmailSummary.messagesFetched + microsoftSummary.messagesFetched,
      repliesPersisted: gmailSummary.repliesPersisted + microsoftSummary.repliesPersisted,
      errors: gmailSummary.errors + microsoftSummary.errors,
    }
  }

  static async syncAccountsByProvider(
    provider: EmailProvider
  ): Promise<SyncSummary> {
    log.info("Starting email sync", { provider }, { operation: "syncAccountsByProvider" })

    const accounts = await prisma.connectedEmailAccount.findMany({
      where: { provider, isActive: true },
    })

    let accountsProcessed = 0
    let messagesFetched = 0
    let repliesPersisted = 0
    let errors = 0

    for (const account of accounts) {
      try {
        const result = await this.syncAccount(account)
        accountsProcessed++
        messagesFetched += result.messagesFetched
        repliesPersisted += result.repliesPersisted
        errors += result.errors
      } catch (error: any) {
        const accountHash = createHash("sha256")
          .update(account.id)
          .digest("hex")
          .substring(0, 16)
        log.error("Sync account error", error, {
          provider,
          accountHash
        }, { operation: "syncAccountsByProvider" })
        errors++
      }
    }

    const summary = {
      accountsProcessed,
      messagesFetched,
      repliesPersisted,
      errors,
    }

    log.info("Email sync complete", {
      provider,
      ...summary
    }, { operation: "syncAccountsByProvider" })

    return summary
  }

  private static async syncAccount(
    account: ConnectedEmailAccount
  ): Promise<AccountSyncResult> {
    const accountHash = createHash("sha256")
      .update(account.id)
      .digest("hex")
      .substring(0, 16)
    const adapter = this.providerMap[account.provider]

    if (!adapter) {
      log.warn("Sync account skipped - no adapter", {
        provider: account.provider,
        accountHash,
        reason: "no_adapter"
      }, { operation: "syncAccount" })
      return { messagesFetched: 0, repliesPersisted: 0, skipped: 0, errors: 0 }
    }

    const cursor = (account.syncCursor as ProviderCursor) || null
    log.debug("Sync account start", {
      provider: account.provider,
      accountHash,
      hasCursor: !!cursor
    }, { operation: "syncAccount" })

    const fetchResult = await adapter.fetchInboundSinceCursor(account, cursor)
    const inboundMessages = fetchResult.messages || []
    
    console.log(`[EmailSync] Account ${accountHash} (${account.provider}): fetched ${inboundMessages.length} messages, bootstrap: ${fetchResult.bootstrapPerformed}`)
    if (inboundMessages.length > 0) {
      console.log(`[EmailSync] Messages:`, inboundMessages.map(m => ({
        from: m.from,
        subject: m.subject?.substring(0, 50),
        hasAttachments: !!m.attachments?.length,
        inReplyTo: m.inReplyTo
      })))
    }

    const deduped = await this.persistInboundMessages(account, inboundMessages)
    const nextCursor = fetchResult.nextCursor || cursor || null
    const existingCursor = account.syncCursor as ProviderCursor | null
    
    // Merge cursors - preserve existing provider cursors while updating the current one
    const mergedCursor: ProviderCursor = {
      // Preserve Gmail cursor
      gmail: nextCursor?.gmail
        ? nextCursor.gmail
        : existingCursor?.gmail,
      // Preserve Microsoft cursor
      microsoft: nextCursor?.microsoft
        ? nextCursor.microsoft
        : existingCursor?.microsoft,
    }

    await prisma.connectedEmailAccount.update({
      where: { id: account.id },
      data: {
        syncCursor: mergedCursor,
        lastSyncAt: new Date(),
      },
    })

    console.log(
      JSON.stringify({
        event: "sync_account_complete",
        provider: account.provider,
        accountHash,
        cursorBefore: cursor,
        cursorAfter: nextCursor,
        messagesFetched: inboundMessages.length,
        processed: deduped.processed,
        repliesPersisted: deduped.repliesPersisted,
        skipped: deduped.skipped,
        messageIds: inboundMessages.map((m) => m.providerId),
        historyPages: fetchResult.historyPageCount || 0,
        bootstrapPerformed: !!fetchResult.bootstrapPerformed,
        timestampMs: Date.now(),
      })
    )

    return {
      messagesFetched: inboundMessages.length,
      repliesPersisted: deduped.repliesPersisted,
      skipped: deduped.skipped,
      errors: 0,
    }
  }

  private static async persistInboundMessages(
    account: ConnectedEmailAccount,
    messages: NormalizedInboundMessage[]
  ): Promise<{ processed: number; skipped: number; repliesPersisted: number }> {
    if (messages.length === 0) {
      return { processed: 0, skipped: 0, repliesPersisted: 0 }
    }

    let processed = 0
    let skipped = 0
    let repliesPersisted = 0

    for (const msg of messages) {
      const existing = await prisma.message.findFirst({
        where: {
          providerId: msg.providerId,
          providerData: {
            path: ["provider"],
            equals: msg.provider,
          },
        },
      })
      if (existing) {
        skipped++
        continue
      }

      const result = await EmailReceptionService.processInboundEmail({
        from: msg.from,
        to: msg.to,
        replyTo: msg.replyTo || undefined,
        subject: msg.subject || undefined,
        body: msg.body || undefined,
        htmlBody: msg.htmlBody || undefined,
        providerId: msg.providerId,
        providerData: {
          ...msg.providerData,
          inReplyTo: msg.inReplyTo ?? msg.providerData?.inReplyTo,
          references: msg.references ?? msg.providerData?.references,
          threadId: msg.threadId ?? msg.providerData?.threadId,
          messageIdHeader: msg.messageIdHeader ?? msg.providerData?.messageIdHeader,
          provider: msg.provider,
          accountId: account.id,
        },
        attachments: msg.attachments,
      })

      processed++
      if (result.requestId) {
        repliesPersisted++
      }
    }

    return { processed, skipped, repliesPersisted }
  }
}


