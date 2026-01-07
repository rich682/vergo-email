import { StorageService } from "./storage.service"
import fs from "fs/promises"
import path from "path"

export class LocalStorageService implements StorageService {
  private baseDir: string

  constructor() {
    this.baseDir = path.join(process.cwd(), "uploads", "attachments")
    // Ensure directory exists
    fs.mkdir(this.baseDir, { recursive: true }).catch(() => {
      // Directory might already exist, ignore error
    })
  }

  async upload(
    file: Buffer,
    key: string,
    contentType?: string
  ): Promise<{ url: string; key: string }> {
    const filePath = path.join(this.baseDir, key)
    const dir = path.dirname(filePath)
    
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, file)

    // Return a URL that can be used to access the file
    const url = `/api/attachments/${key}`
    return { url, key }
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, key)
    return fs.readFile(filePath)
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    try {
      await fs.unlink(filePath)
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error
      }
    }
  }

  async getUrl(key: string): Promise<string> {
    return `/api/attachments/${key}`
  }
}









