# P0 Risk QA Script

## Pre-requisites
- Access to the production/staging environment
- Admin user account
- Test email account (connected)
- Test files (PDF, image, and an executable for testing rejection)

---

## 1. Per-Recipient Rate Limiting Test

### Test 1.1: Verify rate limit blocks duplicate sends
1. Navigate to a Task with a stakeholder
2. Click "Send Request" and send to the stakeholder
3. **Expected**: Email sends successfully
4. Immediately try to send another request to the same recipient
5. **Expected**: Error message "Cannot send to [email] - already emailed within the last 24 hours"
6. **Verify**: Only 1 email was received by the recipient

### Test 1.2: Verify rate limit allows sends to different recipients
1. Send a request to recipient A
2. Immediately send a request to recipient B
3. **Expected**: Both emails send successfully
4. **Verify**: Both recipients received their emails

### Test 1.3: Verify reminders bypass rate limit
1. Send a request with reminders enabled
2. Wait for reminder to be sent (or trigger manually)
3. **Expected**: Reminder sends even though original was sent recently
4. **Verify**: Recipient received both original and reminder

---

## 2. Send Confirmation Dialog Test

### Test 2.1: Verify confirmation appears
1. Navigate to a Task with stakeholders
2. Click "Send Request"
3. Fill in subject/body
4. Click "Send"
5. **Expected**: Confirmation dialog appears showing recipient count
6. Click "Cancel"
7. **Verify**: No email sent

### Test 2.2: Verify confirmation proceeds
1. Repeat steps 1-5
2. Click "Confirm Send"
3. **Expected**: Email sends successfully

---

## 3. MIME Type Validation Test

### Test 3.1: Verify allowed file types upload
1. Navigate to a Task
2. Go to Attachments section
3. Upload a PDF file
4. **Expected**: Upload succeeds
5. Repeat with: .docx, .xlsx, .jpg, .png, .zip
6. **Expected**: All uploads succeed

### Test 3.2: Verify blocked file types rejected
1. Navigate to a Task
2. Go to Attachments section
3. Try to upload an .exe file
4. **Expected**: Error "File type .exe is not allowed"
5. Repeat with: .bat, .js, .py, .sh
6. **Expected**: All uploads rejected

### Test 3.3: Verify Collection uploads validated
1. Navigate to a Task's Collection tab
2. Try to upload an executable
3. **Expected**: Upload rejected

---

## 4. Hard Delete Restriction Test

### Test 4.1: Verify non-admin cannot hard delete
1. Log in as a MEMBER user
2. Navigate to a Task you own
3. Try to delete with `?hard=true` (via API or dev tools)
4. **Expected**: 403 Forbidden error

### Test 4.2: Verify admin can hard delete
1. Log in as an ADMIN user
2. Navigate to a Task
3. Delete with `?hard=true`
4. **Expected**: Task permanently deleted

---

## 5. Subtask Delete Confirmation Test

### Test 5.1: Verify warning for subtasks with attachments
1. Create a Task with a Subtask
2. Add an attachment to the Subtask
3. Click delete on the Subtask
4. **Expected**: Warning mentions attachments will be deleted
5. Click Cancel
6. **Verify**: Subtask still exists

### Test 5.2: Verify no warning for subtasks without attachments
1. Create a Subtask without attachments
2. Click delete
3. **Expected**: Simple "Delete this subtask?" confirmation (no attachment warning)

---

## 6. Email Audit Logging Test

### Test 6.1: Verify successful sends are logged
1. Send a request email
2. Check database: `SELECT * FROM "EmailSendAudit" ORDER BY "createdAt" DESC LIMIT 1`
3. **Expected**: Row exists with `result = 'SUCCESS'`

### Test 6.2: Verify rate-limited sends are logged
1. Send to a recipient
2. Immediately try to send to the same recipient again
3. Check database for audit entry
4. **Expected**: Row exists with `result = 'RATE_LIMITED'`

---

## Sign-off

| Test | Passed | Tester | Date |
|------|--------|--------|------|
| 1.1 Rate limit blocks duplicates | ☐ | | |
| 1.2 Rate limit allows different recipients | ☐ | | |
| 1.3 Reminders bypass rate limit | ☐ | | |
| 2.1 Confirmation appears | ☐ | | |
| 2.2 Confirmation proceeds | ☐ | | |
| 3.1 Allowed files upload | ☐ | | |
| 3.2 Blocked files rejected | ☐ | | |
| 3.3 Collection validated | ☐ | | |
| 4.1 Non-admin cannot hard delete | ☐ | | |
| 4.2 Admin can hard delete | ☐ | | |
| 5.1 Subtask warning with attachments | ☐ | | |
| 5.2 Subtask no warning without | ☐ | | |
| 6.1 Success logged | ☐ | | |
| 6.2 Rate-limited logged | ☐ | | |

**All tests passed**: ☐

**Tester signature**: _______________

**Date**: _______________
