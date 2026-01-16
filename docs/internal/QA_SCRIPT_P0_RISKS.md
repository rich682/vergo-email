# P0 Risk QA Script

## Pre-requisites
- Access to the production/staging environment
- Admin user account
- Test email account (connected)
- Test files (PDF, image, and an executable for testing rejection)

---

## 1. Email Kill Switch Test

### Test 1.1: Verify kill switch blocks emails
1. Set environment variable: `EMAIL_SENDING_ENABLED=false`
2. Navigate to a Task with stakeholders
3. Click "Send Request"
4. Fill in subject/body
5. Click "Send"
6. **Expected**: Error message "Email sending is currently disabled"
7. **Verify**: No email was sent (check email provider)

### Test 1.2: Verify kill switch allows emails when enabled
1. Set environment variable: `EMAIL_SENDING_ENABLED=true` (or remove it)
2. Repeat steps 2-5
3. **Expected**: Email sends successfully
4. **Verify**: Email received by recipient

---

## 2. Max Recipients Cap Test

### Test 2.1: Verify cap blocks oversized sends
1. Set environment variable: `MAX_EMAILS_PER_SEND=5`
2. Create a Task with 10 stakeholders
3. Click "Send Request"
4. Select all recipients
5. Click "Send"
6. **Expected**: Error message about exceeding recipient limit
7. **Verify**: No emails were sent

### Test 2.2: Verify cap allows within-limit sends
1. Keep `MAX_EMAILS_PER_SEND=5`
2. Create a Task with 3 stakeholders
3. Send request
4. **Expected**: All 3 emails sent successfully

---

## 3. Send Confirmation Dialog Test

### Test 3.1: Verify confirmation appears
1. Navigate to a Task with stakeholders
2. Click "Send Request"
3. Fill in subject/body
4. Click "Send"
5. **Expected**: Confirmation dialog appears showing recipient count
6. Click "Cancel"
7. **Verify**: No email sent

### Test 3.2: Verify confirmation proceeds
1. Repeat steps 1-5
2. Click "Confirm Send"
3. **Expected**: Email sends successfully

---

## 4. MIME Type Validation Test

### Test 4.1: Verify allowed file types upload
1. Navigate to a Task
2. Go to Attachments section
3. Upload a PDF file
4. **Expected**: Upload succeeds
5. Repeat with: .docx, .xlsx, .jpg, .png, .zip
6. **Expected**: All uploads succeed

### Test 4.2: Verify blocked file types rejected
1. Navigate to a Task
2. Go to Attachments section
3. Try to upload an .exe file
4. **Expected**: Error "File type .exe is not allowed"
5. Repeat with: .bat, .js, .py, .sh
6. **Expected**: All uploads rejected

### Test 4.3: Verify Collection uploads validated
1. Navigate to a Task's Collection tab
2. Try to upload an executable
3. **Expected**: Upload rejected

---

## 5. Hard Delete Restriction Test

### Test 5.1: Verify non-admin cannot hard delete
1. Log in as a MEMBER user
2. Navigate to a Task you own
3. Try to delete with `?hard=true` (via API or dev tools)
4. **Expected**: 403 Forbidden error

### Test 5.2: Verify admin can hard delete
1. Log in as an ADMIN user
2. Navigate to a Task
3. Delete with `?hard=true`
4. **Expected**: Task permanently deleted

---

## 6. Subtask Delete Confirmation Test

### Test 6.1: Verify warning for subtasks with attachments
1. Create a Task with a Subtask
2. Add an attachment to the Subtask
3. Click delete on the Subtask
4. **Expected**: Warning mentions attachments will be deleted
5. Click Cancel
6. **Verify**: Subtask still exists

### Test 6.2: Verify no warning for subtasks without attachments
1. Create a Subtask without attachments
2. Click delete
3. **Expected**: Simple "Delete this subtask?" confirmation (no attachment warning)

---

## 7. Email Audit Logging Test

### Test 7.1: Verify successful sends are logged
1. Send a request email
2. Check database: `SELECT * FROM "EmailSendAudit" ORDER BY "createdAt" DESC LIMIT 1`
3. **Expected**: Row exists with `result = 'SUCCESS'`

### Test 7.2: Verify blocked sends are logged
1. Set `EMAIL_SENDING_ENABLED=false`
2. Try to send an email
3. Check database for audit entry
4. **Expected**: Row exists with `result = 'BLOCKED'`

### Test 7.3: Verify rate-limited sends are logged
1. Set `MAX_EMAILS_PER_SEND=1`
2. Try to send to 5 recipients
3. Check database for audit entry
4. **Expected**: Row exists with `result = 'RATE_LIMITED'`

---

## Sign-off

| Test | Passed | Tester | Date |
|------|--------|--------|------|
| 1.1 Kill switch blocks | ☐ | | |
| 1.2 Kill switch allows | ☐ | | |
| 2.1 Cap blocks oversized | ☐ | | |
| 2.2 Cap allows within-limit | ☐ | | |
| 3.1 Confirmation appears | ☐ | | |
| 3.2 Confirmation proceeds | ☐ | | |
| 4.1 Allowed files upload | ☐ | | |
| 4.2 Blocked files rejected | ☐ | | |
| 4.3 Collection validated | ☐ | | |
| 5.1 Non-admin cannot hard delete | ☐ | | |
| 5.2 Admin can hard delete | ☐ | | |
| 6.1 Subtask warning with attachments | ☐ | | |
| 6.2 Subtask no warning without | ☐ | | |
| 7.1 Success logged | ☐ | | |
| 7.2 Blocked logged | ☐ | | |
| 7.3 Rate-limited logged | ☐ | | |

**All tests passed**: ☐

**Tester signature**: _______________

**Date**: _______________
