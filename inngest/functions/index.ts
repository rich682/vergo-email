import { inngest } from "../client"

export const generateEmailDraft = inngest.createFunction(
  { id: "generate-email-draft" },
  { event: "email/draft" },
  async () => ({ status: "ok" })
)

export const processInboundEmail = inngest.createFunction(
  { id: "process-inbound-email" },
  { event: "email/inbound" },
  async () => ({ status: "ok" })
)

export const classifyMessage = inngest.createFunction(
  { id: "classify-message" },
  { event: "message/classify" },
  async () => ({ status: "ok" })
)

export const verifyDocument = inngest.createFunction(
  { id: "verify-document" },
  { event: "document/verify" },
  async () => ({ status: "ok" })
)

export const executeAutomationRules = inngest.createFunction(
  { id: "execute-automation-rules" },
  { event: "automation/execute" },
  async () => ({ status: "ok" })
)

export const executeScheduledEmail = inngest.createFunction(
  { id: "execute-scheduled-email" },
  { event: "email/scheduled" },
  async () => ({ status: "ok" })
)
