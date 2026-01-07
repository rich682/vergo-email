import { v4 as uuidv4 } from "uuid"

export class TrackingPixelService {
  /**
   * Generate a unique tracking token for a message
   */
  static generateTrackingToken(): string {
    return uuidv4()
  }

  /**
   * Generate the full tracking URL for a given token
   * Uses TRACKING_BASE_URL if set (for public access), otherwise falls back to NEXTAUTH_URL
   */
  static generateTrackingUrl(token: string): string {
    // TRACKING_BASE_URL should be a publicly accessible URL (e.g., ngrok URL for local testing)
    // This is separate from NEXTAUTH_URL because tracking pixels need to be accessible from the internet
    const baseUrl = process.env.TRACKING_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    return `${baseUrl}/api/tracking/${token}`
  }

  /**
   * Inject a 1x1 tracking pixel into HTML content
   * @param html - The HTML content to inject the pixel into
   * @param trackingUrl - The URL of the tracking pixel
   * @returns HTML with tracking pixel injected
   */
  static injectTrackingPixel(html: string, trackingUrl: string): string {
    const pixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`
    
    // Insert before closing </body> tag if present
    if (html.includes('</body>')) {
      return html.replace('</body>', `${pixel}</body>`)
    }
    
    // Otherwise append to end of HTML
    return html + pixel
  }
}

