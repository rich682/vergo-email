import { put, del, head, list } from "@vercel/blob"
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
    // Get the actual URL for this blob
    const url = await this.getUrl(key)
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to download blob: ${res.statusText}`)
    }
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async delete(key: string): Promise<void> {
    const url = await this.getUrl(key)
    await del(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
  }

  async getUrl(key: string): Promise<string> {
    // Use list to find the blob by its pathname (key)
    // This returns the actual URL from Vercel Blob storage
    const { blobs } = await list({
      prefix: key,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    
    if (blobs.length === 0) {
      throw new Error(`Blob not found: ${key}`)
    }
    
    return blobs[0].url
  }
}



