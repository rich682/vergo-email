import { inngest } from "../client"

export const functions = [
  inngest.createFunction(
    { id: "ping" },
    { event: "app/ping" },
    async () => {
      return { ok: true }
    }
  ),
]
