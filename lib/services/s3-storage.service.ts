import { StorageService } from "./storage.service"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export class S3StorageService implements StorageService {
  private s3Client: S3Client
  private bucketName: string

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME!
    
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    })
  }

  async upload(
    file: Buffer,
    key: string,
    contentType?: string
  ): Promise<{ url: string; key: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: contentType || "application/octet-stream"
    })

    await this.s3Client.send(command)

    // Generate a presigned URL for access
    const url = await this.getUrl(key)
    
    return { url, key }
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    })

    const response = await this.s3Client.send(command)
    
    if (!response.Body) {
      throw new Error("Empty response body")
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as any) {
      chunks.push(chunk)
    }
    
    return Buffer.concat(chunks)
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    })

    await this.s3Client.send(command)
  }

  async getUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    })

    // Generate presigned URL valid for 1 hour
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 })
  }
}

