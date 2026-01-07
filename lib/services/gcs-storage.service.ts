import { StorageService } from "./storage.service"
import { Storage } from "@google-cloud/storage"

export class GCSStorageService implements StorageService {
  private storage: Storage
  private bucketName: string

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME!
    
    if (!this.bucketName) {
      throw new Error("GCS_BUCKET_NAME environment variable is not set")
    }

    // Initialize Storage client
    // On Cloud Run, this will automatically use the default service account
    // For local dev, you may need GOOGLE_APPLICATION_CREDENTIALS
    this.storage = new Storage()
  }

  async upload(
    file: Buffer,
    key: string,
    contentType?: string
  ): Promise<{ url: string; key: string }> {
    const bucket = this.storage.bucket(this.bucketName)
    const fileRef = bucket.file(key)

    await fileRef.save(file, {
      metadata: {
        contentType: contentType || "application/octet-stream",
      },
    })

    // Generate a signed URL for access (valid for 1 hour)
    const url = await this.getUrl(key)
    
    return { url, key }
  }

  async download(key: string): Promise<Buffer> {
    const bucket = this.storage.bucket(this.bucketName)
    const fileRef = bucket.file(key)

    const [buffer] = await fileRef.download()
    return buffer
  }

  async delete(key: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName)
    const fileRef = bucket.file(key)

    await fileRef.delete().catch((error: any) => {
      // Ignore 404 errors (file doesn't exist)
      if (error.code !== 404) {
        throw error
      }
    })
  }

  async getUrl(key: string): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName)
    const fileRef = bucket.file(key)

    // Generate signed URL valid for 1 hour
    const [url] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    })

    return url
  }
}

