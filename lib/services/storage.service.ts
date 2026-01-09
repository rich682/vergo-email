import { LocalStorageService } from "./local-storage.service"

export interface StorageService {
  upload(file: Buffer, key: string, contentType?: string): Promise<{ url: string; key: string }>
  download(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  getUrl(key: string): Promise<string>
}

export function getStorageService(): StorageService {
  return new LocalStorageService()
}


