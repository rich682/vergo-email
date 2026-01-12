import type { ConnectedEmailAccount } from "@prisma/client"
import type {
  EmailIngestProvider,
  FetchInboundResult,
  ProviderCursor,
} from "./types"

export class MicrosoftIngestProvider implements EmailIngestProvider {
  async fetchInboundSinceCursor(
    _account: ConnectedEmailAccount,
    _cursor: ProviderCursor | null
  ): Promise<FetchInboundResult> {
    throw new Error("Microsoft ingest not implemented yet")
  }

  async bootstrapCursor(
    _account: ConnectedEmailAccount
  ): Promise<ProviderCursor | null> {
    throw new Error("Microsoft ingest not implemented yet")
  }
}

