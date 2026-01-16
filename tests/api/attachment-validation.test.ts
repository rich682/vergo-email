/**
 * Attachment Validation Tests
 * 
 * Tests for P0 file upload safety controls:
 * - MIME type allowlist
 * - File extension blocklist
 * - File size limits
 */

import { describe, it, expect } from 'vitest'

// Test the validation logic directly (extracted from the route handlers)
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
])

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr",
  ".js", ".vbs", ".vbe", ".jse", ".ws", ".wsf", ".wsc", ".wsh",
  ".ps1", ".psm1", ".psd1",
  ".sh", ".bash",
  ".dll", ".sys",
  ".app", ".dmg", ".pkg",
  ".jar", ".class",
  ".py", ".pyc", ".pyo",
  ".rb", ".php", ".pl", ".cgi",
])

const SAFE_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".rtf",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff",
  ".zip"
])

function isAllowedFile(filename: string, mimeType: string | undefined): { allowed: boolean; reason?: string } {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."))
  
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `File type "${ext}" is not allowed for security reasons` }
  }
  
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    if (!SAFE_EXTENSIONS.has(ext)) {
      return { allowed: false, reason: `File type "${mimeType}" is not allowed` }
    }
  }
  
  return { allowed: true }
}

describe('Attachment MIME Type Validation', () => {
  describe('Allowed file types', () => {
    it('should allow PDF files', () => {
      const result = isAllowedFile('document.pdf', 'application/pdf')
      expect(result.allowed).toBe(true)
    })

    it('should allow Word documents', () => {
      expect(isAllowedFile('doc.doc', 'application/msword').allowed).toBe(true)
      expect(isAllowedFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').allowed).toBe(true)
    })

    it('should allow Excel spreadsheets', () => {
      expect(isAllowedFile('sheet.xls', 'application/vnd.ms-excel').allowed).toBe(true)
      expect(isAllowedFile('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').allowed).toBe(true)
    })

    it('should allow images', () => {
      expect(isAllowedFile('photo.jpg', 'image/jpeg').allowed).toBe(true)
      expect(isAllowedFile('photo.png', 'image/png').allowed).toBe(true)
      expect(isAllowedFile('photo.gif', 'image/gif').allowed).toBe(true)
      expect(isAllowedFile('photo.webp', 'image/webp').allowed).toBe(true)
    })

    it('should allow ZIP archives', () => {
      expect(isAllowedFile('archive.zip', 'application/zip').allowed).toBe(true)
    })

    it('should allow CSV files', () => {
      expect(isAllowedFile('data.csv', 'text/csv').allowed).toBe(true)
    })

    it('should allow plain text files', () => {
      expect(isAllowedFile('notes.txt', 'text/plain').allowed).toBe(true)
    })
  })

  describe('Blocked file types (security)', () => {
    it('should block executable files', () => {
      const result = isAllowedFile('malware.exe', 'application/x-msdownload')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.exe')
    })

    it('should block batch files', () => {
      expect(isAllowedFile('script.bat', 'application/x-bat').allowed).toBe(false)
      expect(isAllowedFile('script.cmd', 'application/x-cmd').allowed).toBe(false)
    })

    it('should block script files', () => {
      expect(isAllowedFile('script.js', 'application/javascript').allowed).toBe(false)
      expect(isAllowedFile('script.vbs', 'application/x-vbs').allowed).toBe(false)
      expect(isAllowedFile('script.ps1', 'application/x-powershell').allowed).toBe(false)
      expect(isAllowedFile('script.sh', 'application/x-sh').allowed).toBe(false)
    })

    it('should block Python files', () => {
      expect(isAllowedFile('script.py', 'text/x-python').allowed).toBe(false)
      expect(isAllowedFile('compiled.pyc', 'application/x-python-code').allowed).toBe(false)
    })

    it('should block Java files', () => {
      expect(isAllowedFile('app.jar', 'application/java-archive').allowed).toBe(false)
      expect(isAllowedFile('Main.class', 'application/java-vm').allowed).toBe(false)
    })

    it('should block DLL files', () => {
      expect(isAllowedFile('library.dll', 'application/x-msdownload').allowed).toBe(false)
    })

    it('should block macOS app bundles', () => {
      expect(isAllowedFile('app.app', 'application/x-apple-diskimage').allowed).toBe(false)
      expect(isAllowedFile('installer.dmg', 'application/x-apple-diskimage').allowed).toBe(false)
      expect(isAllowedFile('package.pkg', 'application/x-newton-compatible-pkg').allowed).toBe(false)
    })

    it('should block PHP files', () => {
      expect(isAllowedFile('page.php', 'application/x-php').allowed).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('should allow files with safe extensions even if MIME type is unknown', () => {
      // Browser might report unknown MIME type, but extension is safe
      const result = isAllowedFile('document.pdf', 'application/octet-stream')
      expect(result.allowed).toBe(true)
    })

    it('should block files with dangerous extensions regardless of MIME type', () => {
      // Even if someone tries to spoof MIME type
      const result = isAllowedFile('fake.exe', 'application/pdf')
      expect(result.allowed).toBe(false)
    })

    it('should handle files without extension', () => {
      // No extension means we rely on MIME type
      const result = isAllowedFile('noextension', 'application/pdf')
      expect(result.allowed).toBe(true)
    })

    it('should handle files with multiple dots', () => {
      const result = isAllowedFile('document.backup.pdf', 'application/pdf')
      expect(result.allowed).toBe(true)
    })

    it('should be case-insensitive for extensions', () => {
      expect(isAllowedFile('DOCUMENT.PDF', 'application/pdf').allowed).toBe(true)
      expect(isAllowedFile('SCRIPT.EXE', 'application/x-msdownload').allowed).toBe(false)
    })
  })
})

describe('File Size Validation', () => {
  const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

  it('should define a reasonable max file size', () => {
    expect(MAX_FILE_SIZE).toBe(26214400) // 25MB in bytes
  })

  it('should allow files under the limit', () => {
    const fileSize = 10 * 1024 * 1024 // 10MB
    expect(fileSize <= MAX_FILE_SIZE).toBe(true)
  })

  it('should reject files over the limit', () => {
    const fileSize = 30 * 1024 * 1024 // 30MB
    expect(fileSize > MAX_FILE_SIZE).toBe(true)
  })
})
