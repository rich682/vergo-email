import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16
const TAG_POSITION = SALT_LENGTH + IV_LENGTH
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set")
  }
  
  // If key is base64 encoded, decode it
  // Otherwise, use it directly (should be 32 bytes for AES-256)
  try {
    return Buffer.from(key, "base64")
  } catch {
    // If not base64, hash it to get 32 bytes
    return crypto.createHash("sha256").update(key).digest()
  }
}

export function encrypt(text: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const salt = crypto.randomBytes(SALT_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final()
  ])
  
  const tag = cipher.getAuthTag()
  
  // Combine salt + iv + tag + encrypted
  const result = Buffer.concat([salt, iv, tag, encrypted])
  
  return result.toString("base64")
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(encryptedText, "base64")
  
  const salt = data.subarray(0, SALT_LENGTH)
  const iv = data.subarray(SALT_LENGTH, TAG_POSITION)
  const tag = data.subarray(TAG_POSITION, ENCRYPTED_POSITION)
  const encrypted = data.subarray(ENCRYPTED_POSITION)
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
  
  return decrypted.toString("utf8")
}











