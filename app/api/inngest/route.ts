import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import {
  generateEmailDraft,
  processInboundEmail,
  classifyMessage,
  verifyDocument,
  executeAutomationRules,
  executeScheduledEmail
} from "@/inngest/functions"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateEmailDraft,
    processInboundEmail,
    classifyMessage,
    verifyDocument,
    executeAutomationRules,
    executeScheduledEmail
  ]
})









