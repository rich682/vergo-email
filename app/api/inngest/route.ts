import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { functions } from "@/inngest/functions"

export const { GET, POST } = serve({
  client: inngest,
  functions,
})









