# Personalization Feature Verification Checklist

## Build Status
- ✅ Build: **GREEN** (fixed Radix UI dependency issue)
- ✅ Tests: **GREEN** (30 tests passing - fixed infinite recursion in EmailDraftService mock by separating implementation functions from vi.fn() declarations)

## Dependency Fix
- ✅ Fixed `@radix-ui/react-slot` and `@radix-ui/react-select` version mismatch
- ✅ Build succeeds after package updates

## Code Cleanup Status
- ✅ Removed `VariablesSection` import from `app/dashboard/compose/page.tsx`
- ✅ Removed all `variables`, `variableMapping` state references
- ✅ No dead state variables remain
- ✅ Deleted `components/compose/variables-section.tsx` (dead code removed)

---

## FLOW 1 — CSV Mode (recipients from CSV)

### Setup
- [ ] **PASS/FAIL**: Create new request, choose "Upload CSV"
  - Expected: Radio button selector shows "Upload CSV" option
  - Actual: ___

### CSV Upload & Validation
- [ ] **PASS/FAIL**: Upload CSV with email column + 3 tag columns + 5 rows (one row missing a tag value)
  - Expected: CSV uploads successfully
  - Actual: ___

- [ ] **PASS/FAIL**: Contact picker is hidden/disabled in CSV mode
  - Expected: "Who needs to respond?" selector is not visible
  - Actual: ___

- [ ] **PASS/FAIL**: Tags appear immediately from CSV headers
  - Expected: All 3 non-email columns appear as tag chips (e.g., `{{Column1}}`, `{{Column2}}`, `{{Column3}}`)
  - Actual: ___

- [ ] **PASS/FAIL**: Summary shows correct recipient count (5) and tag count (3)
  - Expected: Shows "Recipients: 5" and "Tags (3):" with tag chips
  - Actual: ___

### Preview Functionality
- [ ] **PASS/FAIL**: Preview recipient dropdown shows ALL CSV recipients (at least 5)
  - Expected: Dropdown contains all 5 recipient emails from CSV
  - Actual: ___

- [ ] **PASS/FAIL**: Preview renders with `[MISSING: Tag]` for missing values
  - Expected: When selecting the recipient with missing tag value, preview shows `[MISSING: ColumnName]` placeholder
  - Actual: ___

### Generation
- [ ] **PASS/FAIL**: Generate request creates subject/body templates with `{{Tag}}` placeholders
  - Expected: Generated subject and body contain `{{Column1}}`, `{{Column2}}`, etc. placeholders
  - Actual: ___

### Send Flow - Block on Missing Values ON
- [ ] **PASS/FAIL**: With `blockOnMissingValues` ON, send is blocked with clear error listing missing tags/recipients
  - Expected: Click "Send" shows error: "Missing tags: {{ColumnName}} for recipient@example.com" or similar
  - Actual: ___

### Send Flow - Block on Missing Values OFF
- [ ] **PASS/FAIL**: Toggle `blockOnMissingValues` OFF, send succeeds
  - Expected: Can click "Send" without error
  - Actual: ___

- [ ] **PASS/FAIL**: Per-recipient rendered subject/body is persisted after send
  - Expected: In database/API, each recipient has personalized subject/body with tags replaced (missing tags show `[MISSING: Tag]`)
  - Actual: ___

---

## FLOW 2 — Contact Mode (recipients from selection)

### Setup
- [ ] **PASS/FAIL**: Create new request, choose "Select contacts/groups"
  - Expected: Radio button selector shows "Select contacts/groups" option
  - Actual: ___

- [ ] **PASS/FAIL**: Select 2 recipients
  - Expected: Recipient selector allows selecting 2 contacts/groups
  - Actual: ___

### UI Validation
- [ ] **PASS/FAIL**: CSV upload is hidden/disabled in contact mode
  - Expected: "Upload CSV" section is not visible
  - Actual: ___

- [ ] **PASS/FAIL**: Tags available are only contact fields (if applicable)
  - Expected: `availableTags` includes `["First Name", "Email"]` or similar contact fields
  - Actual: ___

- [ ] **PASS/FAIL**: Preview recipient dropdown shows only selected recipients (2)
  - Expected: Dropdown contains exactly 2 recipients that were selected
  - Actual: ___

### Generation & Send
- [ ] **PASS/FAIL**: Generate request succeeds
  - Expected: Draft is created successfully
  - Actual: ___

- [ ] **PASS/FAIL**: Send succeeds and does NOT reference personalization data
  - Expected: Send endpoint uses recipients from `selectedRecipients`, not from personalization data table
  - Actual: ___

---

## FLOW 3 — Mode Switching Safety

### Switch from Contact to CSV Mode
- [ ] **PASS/FAIL**: Start in contact mode, select recipients, then switch to CSV mode
  - Expected: Confirmation modal appears: "Switching to CSV mode will clear existing contact data. Continue?"
  - Actual: ___

- [ ] **PASS/FAIL**: On confirm, selected recipients are cleared
  - Expected: After confirming, `selectedRecipients` is empty and contact picker is hidden
  - Actual: ___

### Switch from CSV to Contact Mode
- [ ] **PASS/FAIL**: Start in CSV mode, upload CSV, then switch to contact mode
  - Expected: Confirmation modal appears: "Switching to contact mode will clear existing CSV data. Continue?"
  - Actual: ___

- [ ] **PASS/FAIL**: On confirm, CSV personalization data is cleared
  - Expected: After confirming, `csvData` is null, tags are cleared, CSV upload section is hidden
  - Actual: ___

---

## Edge Cases & Validation

### CSV Validation
- [ ] **PASS/FAIL**: Upload CSV with duplicate emails shows blocking error
  - Expected: Error message shows "Duplicate emails found: X duplicates"
  - Actual: ___

- [ ] **PASS/FAIL**: Upload CSV without email column shows blocking error
  - Expected: Error message shows "Email column not found" or similar
  - Actual: ___

- [ ] **PASS/FAIL**: Upload CSV with header collisions (e.g., "Due Date" and "due_date") shows blocking error
  - Expected: Error message indicates header collision
  - Actual: ___

### Tag Rendering
- [ ] **PASS/FAIL**: Template with `{{First Name}}` uses contact database value if available
  - Expected: If recipient email exists in contacts, "First Name" is populated from entity
  - Actual: ___

- [ ] **PASS/FAIL**: Template with `{{First Name}}` falls back to "Hello," if missing
  - Expected: If "First Name" is missing, greeting "Dear [MISSING: First Name]," becomes "Hello,"
  - Actual: ___

---

## Regression Checks

### Contact Mode Requests (No Personalization)
- [ ] **PASS/FAIL**: Existing contact-mode request creation still works
  - Expected: Can create request with selected contacts, generate, and send without CSV/personalization
  - Actual: ___

- [ ] **PASS/FAIL**: Request tracking/completion still works for contact-mode requests
  - Expected: Requests list shows contact-mode requests correctly with completion percentages
  - Actual: ___

---

## Test Fix Notes
- Fixed infinite recursion in EmailDraftService mock by separating implementation functions from vi.fn() declarations
- Issue: Inline vi.fn() implementations were causing recursive references
- Solution: Created separate helper functions (mockCreate, mockUpdate, etc.) and used mockImplementation in beforeEach
- All 30 tests now passing consistently

---

## Summary
- Total checks: ___
- Passed: ___
- Failed: ___
- Date verified: ___

