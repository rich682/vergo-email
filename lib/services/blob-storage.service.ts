import { put, del, head } from "@vercel/blob"
import { StorageService } from "./storage.service"

// Vercel Blob-backed storage for uploads/attachments.
// Requires BLOB_READ_WRITE_TOKEN to be set in the environment.
export class BlobStorageService implements StorageService {
  async upload(
    file: Buffer,
    key: string,
    contentType?: string
  ): Promise<{ url: string; key: string }> {
    const { url } = await put(key, file, {
      access: "public",
      contentType: contentType || "application/octet-stream",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return { url, key }
  }

  async download(key: string): Promise<Buffer> {
    const res = await fetch(this.buildUrl(key))
    if (!res.ok) {
      throw new Error(`Failed to download blob: ${res.statusText}`)
    }
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async delete(key: string): Promise<void> {
    await del(this.buildUrl(key), {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
  }

  async getUrl(key: string): Promise<string> {
    // Ensure the blob exists; head will throw if missing
    await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN })
    return this.buildUrl(key)
  }

  private buildUrl(key: string): string {
    // Vercel Blob serves at a predictable URL when using public access.
    return `https://vercel.blob/${key}`
  }
}


