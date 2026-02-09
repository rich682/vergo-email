import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { EmailReceptionService, InboundEmailData } from "@/lib/services/email-reception.service"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { prisma } from "@/lib/prisma"
import { createHash } from "crypto"
import { GmailIngestProvider } from "@/lib/providers/email-ingest/gmail-ingest.provider"
import { ProviderCursor } from "@/lib/providers/email-ingest/types"
import { createRemoteJWKSet, jwtVerify } from "jose"

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
)

/**
 * Verify Google Pub/Sub push notification JWT token.
 * Returns the verified payload or null if verification fails.
 */
async function verifyPubSubToken(request: NextRequest): Promise<boolean> {
  // If no verification email is configured, skip verification (development mode)
  const expectedEmail = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT
  if (!expectedEmail) {
    console.log(JSON.stringify({
      event: "webhook_auth_skip",
      timestampMs: Date.now(),
      reason: "GMAIL_PUBSUB_SERVICE_ACCOUNT not configured"
    }))
    return true
  }

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    console.log(JSON.stringify({
      event: "webhook_auth_fail",
      timestampMs: Date.now(),
      reason: "missing_bearer_token"
    }))
    return false
  }

  const token = authHeader.substring(7)
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: "https://accounts.google.com",
    })

    // Verify the service account email matches
    if (payload.email !== expectedEmail) {
      console.log(JSON.stringify({
        event: "webhook_auth_fail",
        timestampMs: Date.now(),
        reason: "email_mismatch",
        expected: expectedEmail,
        received: String(payload.email || "").substring(0, 20)
      }))
      return false
    }

    return true
  } catch (err: any) {
    console.log(JSON.stringify({
      event: "webhook_auth_fail",
      timestampMs: Date.now(),
      reason: "jwt_verification_failed"
    }))
    return false
  }
}

export async function POST(request: NextRequest) {
  // Verify the request is from Google Pub/Sub
  const isVerified = await verifyPubSubToken(request)
  if (!isVerified) {
    // Return 200 to prevent retries, but don't process
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Always return 200 OK to prevent Gmail from retrying
  try {
    const body = await request.json()

    // Gmail push notification format from Pub/Sub
    // { message: { data: base64EncodedMessageId, messageId: string, attributes?: { emailAddress?: string, historyId?: string } } }
    const historyId = body.message?.attributes?.historyId || null
    const emailAddress = body.message?.attributes?.emailAddress || null
    
    // Structured log for webhook receipt
    console.log(JSON.stringify({
      event: 'webhook_received',
      timestampMs: Date.now(),
      hasHistoryId: !!historyId,
      historyId: historyId || null,
      mailboxEmail: emailAddress ? emailAddress.substring(0, 3) + '***' : null, // Partial email for logging
      hasMessageData: !!body.message?.data
    }))

    if (body.message?.data) {
      const messageId = Buffer.from(body.message.data, "base64").toString()
      const ingestProvider = new GmailIngestProvider()

      // Route to correct account: Try to identify account from emailAddress attribute first
      let accounts: Awaited<ReturnType<typeof prisma.connectedEmailAccount.findMany>> = []
      
      if (emailAddress) {
        // Try to find account by email address from Pub/Sub notification
        const accountByEmail = await prisma.connectedEmailAccount.findFirst({
          where: {
            provider: "GMAIL",
            isActive: true,
            email: emailAddress
          }
        })
        if (accountByEmail) {
          accounts = [accountByEmail]
        }
      }

      // If no account found by email, get all active Gmail accounts but stop on first success
      if (accounts.length === 0) {
        accounts = await prisma.connectedEmailAccount.findMany({
          where: {
            provider: "GMAIL",
            isActive: true
          }
        })
      }

      if (accounts.length === 0) {
        console.log(JSON.stringify({
          event: 'webhook_received',
          timestampMs: Date.now(),
          error: 'no_active_gmail_accounts'
        }))
        return NextResponse.json({ success: true, processed: false, reason: 'no_active_accounts' })
      }

      // Try each account until we successfully process the message
      let processed = false
      for (const account of accounts) {
        try {
          const oauth2Client = await EmailConnectionService.getGmailClient(account.id)
          if (!oauth2Client) {
            continue
          }

          const gmail = google.gmail({ version: "v1", auth: oauth2Client })

          // Fetch the message with full payload; try next account on 404
          let message
          try {
            message = await gmail.users.messages.get({
              userId: "me",
              id: messageId,
              format: "raw"
            })
          } catch (fetchError: any) {
            if (fetchError.code === 404) {
              continue
            }
            throw fetchError
          }

          if (!message.data.raw) {
            continue
          }

          const normalized = await ingestProvider.normalizeRawMessage(
            account,
            message.data
          )

          if (!normalized) {
            continue
          }

          // Ensure provider flag is present for dedupe consistency
          normalized.providerData = {
            ...(normalized.providerData || {}),
            provider: "GMAIL"
          }

          // De-dupe by provider + providerId (scoped to account via provider)
          const existing = await prisma.message.findFirst({
            where: {
              providerId: normalized.providerId,
              providerData: {
                path: ["provider"],
                equals: "GMAIL"
              }
            }
          })
          if (existing) {
            const accountHash = createHash('sha256').update(account.id).digest('hex').substring(0, 16)
            console.log(JSON.stringify({
              event: 'webhook_duplicate_skipped',
              timestampMs: Date.now(),
              accountHash,
              providerId: normalized.providerId
            }))
            processed = true
            continue
          }

          const emailData: InboundEmailData = {
            from: normalized.from,
            to: normalized.to,
            replyTo: normalized.replyTo || undefined,
            subject: normalized.subject || undefined,
            body: normalized.body || undefined,
            htmlBody: normalized.htmlBody || undefined,
            providerId: normalized.providerId,
            providerData: normalized.providerData,
            attachments: normalized.attachments
          }

          await EmailReceptionService.processInboundEmail(emailData)
          // Advance cursor if webhook provides a newer historyId (merge existing cursor)
          if (historyId) {
            const existingCursor = (account.syncCursor as ProviderCursor) || {}
            const currentCursor = existingCursor.gmail
            const currentHistory =
              currentCursor?.historyId &&
              !Number.isNaN(Number(currentCursor.historyId))
                ? BigInt(currentCursor.historyId)
                : null
            const incomingHistory = !Number.isNaN(Number(historyId))
              ? BigInt(historyId)
              : null
            if (
              incomingHistory &&
              (!currentHistory || incomingHistory > currentHistory)
            ) {
              const mergedCursor: ProviderCursor = {
                ...existingCursor,
                gmail: { historyId: historyId.toString() }
              }
              await prisma.connectedEmailAccount.update({
                where: { id: account.id },
                data: {
                  syncCursor: mergedCursor,
                  lastSyncAt: new Date()
                }
              })
            }
          }
          processed = true
          break // Successfully processed, stop trying other accounts
        } catch (error: any) {
          // Log error but continue to next account (or break if we've tried all)
          const accountHash = createHash('sha256').update(account.id).digest('hex').substring(0, 16)
          console.error(JSON.stringify({
            event: 'webhook_account_error',
            timestampMs: Date.now(),
            accountHash,
            error: error.message?.substring(0, 100),
            errorCode: error.code
          }))
          // Continue to next account unless it's a non-404 error that suggests account-level issue
          if (error.code !== 404 && error.code !== 'ENOTFOUND') {
            // For non-404 errors, log but continue trying other accounts
            continue
          }
        }
      }

      if (!processed) {
        console.log(JSON.stringify({
          event: 'webhook_received',
          timestampMs: Date.now(),
          error: 'could_not_process_from_any_account',
          messageId: messageId.substring(0, 20) + '...',
          accountsTried: accounts.length
        }))
      }

      return NextResponse.json({ success: true, processed })
    }

    // No message data in payload
    return NextResponse.json({ success: true, processed: false, reason: 'no_message_data' })
  } catch (error: any) {
    console.error(JSON.stringify({
      event: 'webhook_received',
      timestampMs: Date.now(),
      error: 'webhook_parse_error',
      errorMessage: error.message?.substring(0, 100)
    }))
    console.error("Error processing Gmail webhook:", error)
  }

  // Always return 200 OK to prevent retries
  return NextResponse.json({ success: true })
}

