import { describe, it, expect } from 'vitest'
import { isBounce, isOutOfOffice } from '@/lib/utils/bounce-detection'

describe('isBounce', () => {
  it('should detect mailer-daemon from address', () => {
    expect(isBounce({ fromAddress: 'MAILER-DAEMON@mail.example.com' })).toBe(true)
  })

  it('should detect postmaster from address', () => {
    expect(isBounce({ fromAddress: 'postmaster@example.com' })).toBe(true)
  })

  it('should detect "delivery status notification" in subject', () => {
    expect(isBounce({ subject: 'Delivery Status Notification (Failure)' })).toBe(true)
  })

  it('should detect "550 5.1.1" in body', () => {
    expect(isBounce({ body: 'Remote server returned 550 5.1.1 - user not found' })).toBe(true)
  })

  it('should detect "mailbox full" in body', () => {
    expect(isBounce({ body: 'Delivery failed: mailbox full, try again later' })).toBe(true)
  })

  it('should return false for normal email content', () => {
    expect(isBounce({
      subject: 'Re: Invoice Q4',
      body: 'Thanks for sending, I will review this week.',
      fromAddress: 'john@company.com',
    })).toBe(false)
  })

  it('should handle null/undefined inputs gracefully', () => {
    expect(isBounce({})).toBe(false)
    expect(isBounce({ subject: null, body: null, fromAddress: null })).toBe(false)
    expect(isBounce({ subject: undefined })).toBe(false)
  })
})

describe('isOutOfOffice', () => {
  it('should detect "out of office" in subject', () => {
    expect(isOutOfOffice({ subject: 'Out of Office: Re: Quarterly Review' })).toBe(true)
  })

  it('should detect "automatic reply" in subject', () => {
    expect(isOutOfOffice({ subject: 'Automatic Reply: Your request' })).toBe(true)
  })

  it('should detect OOO body patterns', () => {
    expect(isOutOfOffice({
      body: 'I am currently out of the office and will return on Monday.',
    })).toBe(true)
  })

  it('should return false for normal email content', () => {
    expect(isOutOfOffice({
      subject: 'Re: Project Update',
      body: 'Sounds good, let me follow up on that.',
    })).toBe(false)
  })

  it('should handle null/undefined inputs', () => {
    expect(isOutOfOffice({})).toBe(false)
    expect(isOutOfOffice({ subject: null, body: null })).toBe(false)
  })
})
