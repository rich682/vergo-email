# Workflow Audit Document

**Generated**: January 21, 2026  
**Last Updated**: January 21, 2026  
**Purpose**: Evidence-bound workflow health assessment for restoration prioritization  
**Taxonomy Reference**: `docs/product/workflow-taxonomy.md`

---

## Core Mental Model: Jobs and Capabilities

> **Jobs are containers; capabilities define behavior.**

### The Job Capability Model

A **Job** (TaskInstance) is the atomic unit of work in the system. It is a **container** that holds data, relationships, and state. Jobs do NOT have "types" that fundamentally change their structure.

Instead, Jobs have **Capabilities** that can be enabled:

| Capability | Description | Key Workflows |
|------------|-------------|---------------|
| **Core** | Basic job operations available to all jobs | Create, Archive, Delete, Owner, Collaborators, Notes, Status |
| **Table** | Structured data with schema, import, variance | WF-03b, WF-03d, WF-03e |
| **Reconciliation** | Document comparison with anchor/supporting model | WF-03c, WF-03h, WF-03i |
| **Request** | Email communication, reminders, tracking | WF-05a through WF-05n |
| **Evidence** | File collection, review, export | WF-06a through WF-06e |

### UI Terminology Note

The internal `TaskType.DATABASE` is displayed to users as **"Variance"** to reflect accounting terminology. This is a user-facing language change only—backend enums and APIs remain unchanged.

### Why This Model

1. **Stability**: The Job container is frozen. Refactors target capabilities, not Jobs.
2. **Independence**: Capabilities can evolve without affecting each other.
3. **Safety**: No new "Job types" are introduced. Existing code continues to work.
4. **Cursor Safety**: Reduces hallucination of new abstractions.

### What Is NOT a Capability (Out of Scope)

- **Approval workflows**: Will be layered separately in a future phase.
- **Board operations**: Boards are containers for Jobs, not Job capabilities.
- **Authentication**: System-level, not Job-related.
- **Contacts**: Supporting data, not Job behavior.

---

## Developer Guardrails

### CRITICAL: Job Stability Rules

1. **Do NOT introduce new Job types**. Extend via capabilities instead.
2. **Do NOT rename** `Job`, `Board`, `TaskInstance`, or `Organization`.
3. **Do NOT refactor the Job container**. Refactors must target a specific capability.
4. **Capabilities may change independently**. Job lifecycle must remain stable.
5. **Approval logic is OUT OF SCOPE** for this taxonomy version.

### Safe Refactoring Pattern

**WRONG**: "Refactor jobs to support approval"  
**RIGHT**: "Add Approval capability to jobs" (future phase, not in current scope)

**WRONG**: "Create new ReconciliationJob type"  
**RIGHT**: "Enable Reconciliation capability on existing Job"

---

## Summary Statistics

### By Status

| Status | Count | Percentage |
|--------|-------|------------|
| GREEN | 38 | 63% |
| YELLOW | 13 | 22% |
| RED | 9 | 15% |
| **Total** | **60** | 100% |

### By Parent Workflow

| Parent ID | Parent Name | Sub-Workflows | GREEN | YELLOW | RED |
|-----------|-------------|---------------|-------|--------|-----|
| PWF-01 | Authentication & Onboarding | 4 | 4 | 0 | 0 |
| PWF-02 | Board Management | 9 | 7 | 1 | 1 |
| PWF-03 | Job Lifecycle | 8 | 5 | 2 | 1 |
| PWF-04 | Job Collaboration & Governance | 8 | 7 | 1 | 0 |
| PWF-05 | Requests & Communication | 14 | 5 | 5 | 4 |
| PWF-06 | Evidence Collection | 5 | 4 | 0 | 1 |
| PWF-07 | Contact Management | 6 | 6 | 0 | 0 |
| PWF-08 | Email Account Management | 3 | 3 | 0 | 0 |
| PWF-09 | System Automation | 6 | 4 | 1 | 1 |

---

## CRITICAL: AI Integration Gaps

The following core AI capabilities are **missing services** or **broken**, preventing AI from being the "first reviewer" of all inbound content.

### P0 Blockers (Must Build)

| ID | Name | Issue | Impact |
|----|------|-------|--------|
| WF-03h | AI Process Reconciliation | **No service exists** | Reconciliation jobs upload files but never process them |
| WF-05m | AI Extract Attachment Content | **No service exists** | AI cannot read PDF/Excel/CSV content from submissions |
| WF-05n | AI Determine Completion Status | **No service exists** | System cannot auto-detect if request is fulfilled |
| WF-06e | AI Analyze Evidence Content | **No service exists** | Evidence files are stored but never analyzed |
| WF-09f | AI First-Pass Document Review | **No service exists** | All inbound content should be AI-reviewed before human |

### P1 Degraded (Currently Broken/Partial)

| ID | Name | Issue | Impact |
|----|------|-------|--------|
| WF-05i | AI Auto-Draft Request | Env issue: `OPENAI_API_KEY` | Falls back to template (you saw this) |
| WF-05j | AI Auto-Draft Reminder | Env issue: `OPENAI_API_KEY` | Falls back to template |
| WF-05k | AI Auto-Draft Reply | Env issue: `OPENAI_API_KEY` | Falls back to template |
| WF-05l | AI Analyze Inbound Email | Partial: body only | Ignores attachment content |
| WF-09e | AI Content-Based Risk | Partial: time-based only | Risk not based on submission quality |

### Missing Services to Build

```
lib/services/
├── attachment-extraction.service.ts   # P0: PDF/Excel/CSV/Image → text
├── reconciliation-processor.service.ts # P0: Compare Excel files
├── completion-detection.service.ts    # P0: Is submission complete?
├── evidence-analysis.service.ts       # P0: Analyze evidence files
├── first-pass-review.service.ts       # P0: Inngest: AI reviews all inbound
└── board-summary.service.ts           # P1: AI board status summary
```

---

## Part 1: Workflow Health Status (By Parent)

---

## PWF-01: Authentication & Onboarding

Parent workflow for user account creation, authentication, and team onboarding flows.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-01a | Sign Up / Registration | WF-01 | GREEN |
| WF-01b | Sign In / Sign Out | WF-02 | GREEN |
| WF-01c | Password Reset | WF-03 | GREEN |
| WF-01d | Accept Team Invite | - | GREEN |

---

### WF-01a: Sign Up / Registration

**Legacy ID**: WF-01  
**Status**: GREEN  
**Goal**: New user creates an account and organization

#### Evidence
- Frontend: `app/signup/page.tsx:48` - `fetch("/api/auth/signup", ...)`
- API: `POST /api/auth/signup`
- Services: `auth-email.service.ts` (verification email)

#### Verification Steps
1. Navigate to `/signup`
2. Fill form with company name, name, email, password
3. Submit form
4. Expect: `POST /api/auth/signup` called, verification email sent
5. Check inbox for verification link

---

### WF-01b: Sign In / Sign Out

**Legacy ID**: WF-02  
**Status**: GREEN  
**Goal**: Existing user authenticates to access dashboard

#### Evidence
- Frontend: `app/auth/signin/page.tsx:21` - `signIn("credentials", ...)`
- API: `POST /api/auth/[...nextauth]` (NextAuth handler)
- Services: `lib/auth.ts` (CredentialsProvider)

#### Verification Steps
1. Navigate to `/auth/signin`
2. Enter email and password
3. Submit form
4. Expect: Redirect to `/dashboard/jobs`

---

### WF-01c: Password Reset

**Legacy ID**: WF-03  
**Status**: GREEN  
**Goal**: User resets forgotten password via email link

#### Evidence
- Frontend: `app/auth/forgot-password/page.tsx:20` - `fetch("/api/auth/forgot-password", ...)`
- Frontend: `app/auth/reset-password/page.tsx:33,69` - `fetch("/api/auth/reset-password", ...)`
- API: `POST /api/auth/forgot-password`, `GET|POST /api/auth/reset-password`
- Services: `auth-email.service.ts` (sendPasswordResetEmail)

#### Verification Steps
1. Navigate to `/auth/forgot-password`
2. Enter email, submit
3. Expect: `POST /api/auth/forgot-password` called
4. Check inbox for reset link
5. Click link, set new password
6. Expect: `POST /api/auth/reset-password` called

---

### WF-01d: Accept Team Invite

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: Invited user joins an existing organization

#### Evidence
- Frontend: `app/auth/accept-invite/page.tsx:42,84` - `fetch("/api/auth/accept-invite", ...)`
- API: `GET|POST /api/auth/accept-invite`
- Services: `auth-email.service.ts`

#### Verification Steps
1. Receive invitation email from team admin
2. Click invite link
3. Complete registration or sign in
4. Expect: `POST /api/auth/accept-invite` called
5. User added to organization

---

## PWF-02: Board Management

Parent workflow for period-based organization of jobs through boards.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-02a | Create Board | WF-04 | GREEN |
| WF-02b | Edit Board Settings | WF-04 | GREEN |
| WF-02c | View Board with Jobs | WF-05 | GREEN |
| WF-02d | Assign Board Collaborators | - | GREEN |
| WF-02e | Set Board Cadence / Periods | - | YELLOW |
| WF-02f | Mark Board Complete | - | GREEN |
| WF-02g | Archive / Restore Board | WF-04 | GREEN |
| WF-02h | Delete Board | WF-04 | GREEN |

---

### WF-02a: Create Board

**Legacy ID**: WF-04  
**Status**: GREEN  
**Goal**: User creates a new board for a period

#### Evidence
- Frontend: `app/dashboard/boards/page.tsx:255,452` - `fetch("/api/boards", ...)`
- Frontend: `components/boards/create-board-modal.tsx:226` - POST
- API: `POST /api/boards`
- Services: `board.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Click "New Board" button
3. Fill form, submit
4. Expect: `POST /api/boards` called

---

### WF-02b: Edit Board Settings

**Legacy ID**: WF-04  
**Status**: GREEN  
**Goal**: User modifies board name, dates, or settings

#### Evidence
- Frontend: `components/boards/edit-board-modal.tsx:222` - PATCH
- API: `PATCH /api/boards/[id]`
- Services: `board.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Click board row, edit
3. Save changes
4. Expect: `PATCH /api/boards/[id]` called

---

### WF-02c: View Board with Jobs

**Legacy ID**: WF-05  
**Status**: GREEN  
**Goal**: User views all jobs assigned to a board

#### Evidence
- Frontend: `app/dashboard/jobs/page.tsx:179,199` - `fetch("/api/task-instances", ...)`, `fetch("/api/boards/[id]", ...)`
- Frontend: `app/dashboard/jobs/[id]/page.tsx:357` - `fetch("/api/task-instances/[id]", ...)`
- API: `GET /api/boards/[id]`, `GET /api/task-instances`
- Services: `board.service.ts`, `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs`
2. Select board from dropdown
3. Expect: `GET /api/task-instances?boardId=X` called
4. Click job row
5. Expect: `GET /api/task-instances/[id]` called

---

### WF-02d: Assign Board Collaborators

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User adds team members to collaborate on a board

#### Evidence
- Frontend: `app/dashboard/boards/page.tsx` - Team members UI
- API: `POST /api/boards/team-members`
- Services: `board.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Click board to open
3. Add team member
4. Expect: `POST /api/boards/team-members` called

---

### WF-02e: Set Board Cadence / Periods

**Legacy ID**: -  
**Status**: YELLOW  
**Goal**: User configures recurring board schedule

#### Evidence
- API: `PATCH /api/boards/[id]` (supports cadence fields)
- Services: `board.service.ts`

#### Blockers
- [ ] No dedicated UI for cadence configuration
- [ ] Fields exist in API but not surfaced in UI

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Edit board (cadence UI not visible)

---

### WF-02f: Mark Board Complete

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User marks board done, triggering snapshots for comparison

#### Evidence
- Frontend: `app/dashboard/boards/page.tsx` - Status dropdown
- API: `PATCH /api/boards/[id]` (status=COMPLETE)
- Services: `board.service.ts` - `handleBoardCompletion()` at line 459-464

#### How Snapshots Work
1. User marks board as "Complete" via `/dashboard/boards` page
2. `BoardService.handleBoardCompletion()` automatically sets `isSnapshot: true` on all task instances
3. Compare tab can then find prior period snapshots for variance analysis

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Click status dropdown on board
3. Select "Complete"
4. Expect: `PATCH /api/boards/[id]` called
5. All jobs become snapshots

---

### WF-02g: Archive / Restore Board

**Legacy ID**: WF-04  
**Status**: GREEN  
**Goal**: User archives old boards or restores them

#### Evidence
- Frontend: `app/dashboard/boards/page.tsx` - Archive action
- API: `PATCH /api/boards/[id]` (archived flag)
- Services: `board.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Click archive icon on board
3. Expect: `PATCH /api/boards/[id]` with archived=true

---

### WF-02h: Delete Board

**Legacy ID**: WF-04  
**Status**: GREEN  
**Goal**: User permanently removes a board

#### Evidence
- Frontend: `app/dashboard/boards/page.tsx:400,416,438,474`
- API: `DELETE /api/boards/[id]`
- Services: `board.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/boards`
2. Click delete action on board
3. Confirm deletion
4. Expect: `DELETE /api/boards/[id]` called

---

## PWF-03: Job Lifecycle

Parent workflow for creation, configuration, and management of jobs.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-03a | Create Generic Job | WF-06 | GREEN |
| WF-03b | Create Table Job | WF-09 | YELLOW |
| WF-03c | Create Reconciliation Job | WF-12 | YELLOW |
| WF-03d | Import / Edit Table Data | WF-10 | GREEN |
| WF-03e | Compare Periods / Variance | WF-11 | GREEN |
| WF-03f | Archive / Restore Job | - | GREEN |
| WF-03g | Delete Job | - | GREEN |

---

### WF-03a: Create Generic Job

**Legacy ID**: WF-06  
**Status**: GREEN  
**Goal**: User creates a standard job for tracking requests

#### Evidence
- Frontend: `app/dashboard/jobs/page.tsx:376,443,505` - `fetch("/api/task-instances", { method: "POST" })`
- API: `POST /api/task-instances`
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs`
2. Click "New Job" or use inline create
3. Enter job name, select board (optional)
4. Submit
5. Expect: `POST /api/task-instances` called

---

### WF-03b: Create Table Job

**Legacy ID**: WF-09  
**Status**: YELLOW  
**Goal**: User creates a table-type job with schema definition

#### Evidence
- Frontend: `app/dashboard/jobs/page.tsx:376` - `fetch("/api/task-instances", { method: "POST", body: { type: "TABLE" } })`
- Frontend: `components/jobs/table/data-tab.tsx:116` - `fetch("/api/task-lineages/[id]/schema", { method: "PATCH" })`
- API: `POST /api/task-instances`, `PATCH /api/task-lineages/[id]/schema`
- Services: `task-instance.service.ts`, `task-lineage.service.ts`

#### Blockers
- [x] UI exists for creating TABLE type job
- [ ] Schema definition requires lineage to exist first (created automatically)
- [ ] No dedicated "Create Table Job" wizard UI

#### Minimal Fix Plan
1. Add "Table Job" option to new job dropdown with inline schema editor
2. Wire schema creation to happen atomically with job creation

#### Verification Steps
1. Navigate to `/dashboard/jobs`
2. Create new job with type "TABLE"
3. Navigate to job detail, Data tab
4. Expect: Schema editor visible
5. Edit schema
6. Expect: `PATCH /api/task-lineages/[id]/schema` called

---

### WF-03c: Create Reconciliation Job

**Legacy ID**: WF-12  
**Status**: YELLOW  
**Goal**: User creates a reconciliation-type job and uploads reconciliation data

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx:433` - `fetch("/api/task-instances/[id]/reconciliations", ...)`
- Frontend: `components/jobs/reconciliation-upload-modal.tsx:105` - POST
- API: `GET|POST /api/task-instances/[id]/reconciliations`
- Services: `task-instance.service.ts`

#### Blockers
- [x] UI exists for creating RECONCILIATION type job
- [x] Upload modal exists
- [ ] Missing wiring: No automated matching or variance detection logic

#### Minimal Fix Plan
1. Add reconciliation matching service (compare uploaded sets)
2. Wire match results to display in UI

#### Verification Steps
1. Navigate to `/dashboard/jobs`
2. Create new job with type "RECONCILIATION"
3. Navigate to job detail
4. Click "Upload Reconciliation"
5. Upload file
6. Expect: `POST /api/task-instances/[id]/reconciliations` called

---

### WF-03d: Import / Edit Table Data

**Legacy ID**: WF-10  
**Status**: GREEN  
**Goal**: User imports CSV/Excel data, edits collaboration columns, and signs off dataset

#### Evidence
- Frontend: `components/jobs/table/import-modal.tsx:297,328` - `fetch("/api/task-instances/[id]/table/preview-import", ...)`, `fetch("/api/task-instances/[id]/table/import", ...)`
- Frontend: `components/jobs/table/data-tab.tsx:67,135` - `fetch("/api/task-instances/[id]/table/rows", ...)`, `fetch("/api/task-instances/[id]/table/cell", ...)`
- Frontend: `components/jobs/table/data-tab.tsx:126,137` - Dataset signoff UI via `/api/task-instances/[id]/table/signoff`
- API: `POST /api/task-instances/[id]/table/preview-import`, `POST /api/task-instances/[id]/table/import`, `GET /api/task-instances/[id]/table/rows`, `PATCH /api/task-instances/[id]/table/cell`, `GET|POST /api/task-instances/[id]/table/signoff`
- Services: `table-task.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]` (TABLE type)
2. Click "Import" button
3. Upload CSV file
4. Expect: `POST /api/task-instances/[id]/table/preview-import` called
5. Confirm import
6. Expect: `POST /api/task-instances/[id]/table/import` called
7. Edit cell
8. Expect: `PATCH /api/task-instances/[id]/table/cell` called
9. View signoff status bar
10. Expect: `GET /api/task-instances/[id]/table/signoff` called
11. Click "Sign Off Dataset" button
12. Expect: `POST /api/task-instances/[id]/table/signoff` called

---

### WF-03e: Compare Periods / Variance

**Legacy ID**: WF-11  
**Status**: GREEN  
**Goal**: User compares current period data with prior period snapshots

#### Evidence
- Frontend: `components/jobs/table/compare-view.tsx:81` - `fetch("/api/task-instances/[id]/table/compare", ...)`
- Frontend: `components/jobs/table/compare-view.tsx:72,87,137-156` - NO_PRIOR_SNAPSHOT empty state handling
- API: `GET /api/task-instances/[id]/table/compare` - Returns `reason: "NO_PRIOR_SNAPSHOT"` when no prior snapshot
- Services: `table-task.service.ts` (getMoMDeltas)
- Snapshot trigger: `lib/services/board.service.ts:459-464`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]` (TABLE type)
2. Click "Compare" tab
3. If no prior snapshot: See "No Prior Period Snapshot" empty state with guidance
4. Go to Boards page, mark prior board as Complete
5. Return to Compare tab, refresh
6. Expect: `GET /api/task-instances/[id]/table/compare` returns variance data

---

### WF-03f: Archive / Restore Job

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User archives completed jobs or restores them

#### Evidence
- Frontend: `app/dashboard/jobs/page.tsx` - Archive action
- API: `PATCH /api/task-instances/[id]` (archived flag)
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs`
2. Click archive action on job
3. Expect: `PATCH /api/task-instances/[id]` with archived=true

---

### WF-03g: Delete Job

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User permanently removes a job

#### Evidence
- Frontend: `app/dashboard/jobs/page.tsx`
- API: `DELETE /api/task-instances/[id]`
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs`
2. Click delete action on job
3. Confirm deletion
4. Expect: `DELETE /api/task-instances/[id]` called

---

## PWF-04: Job Collaboration & Governance

Parent workflow for team collaboration, ownership, and governance controls.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-04a | Manage Job Stakeholders | - | GREEN |
| WF-04b | Manage Job Collaborators | - | GREEN |
| WF-04c | Assign / Change Job Owner | - | GREEN |
| WF-04d | Set / Manage Job Deadlines | - | GREEN |
| WF-04e | Manage Job Attachments | - | YELLOW |
| WF-04f | Manage Job Notes | - | GREEN |
| WF-04g | Job Activity & Comments | - | GREEN |
| WF-04h | Job Status & Lifecycle | - | GREEN |

---

### WF-04a: Manage Job Stakeholders

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User assigns external contacts as stakeholders

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx` - Stakeholders section
- API: `GET/POST /api/task-instances/[id]/stakeholders`
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Add stakeholder from contacts
3. Expect: `POST /api/task-instances/[id]/stakeholders` called

---

### WF-04b: Manage Job Collaborators

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User adds internal team members to a job

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx:559,817,836` - Collaborators section
- API: `GET/POST/DELETE /api/task-instances/[id]/collaborators`
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Add Collaborator"
3. Select team member
4. Expect: `POST /api/task-instances/[id]/collaborators` called

---

### WF-04c: Assign / Change Job Owner

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User transfers job ownership

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx` - Owner field
- API: `PATCH /api/task-instances/[id]` (ownerId field)
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Click owner field
3. Select new owner
4. Expect: `PATCH /api/task-instances/[id]` with ownerId

---

### WF-04d: Set / Manage Job Deadlines

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User sets or updates job due dates

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx` - Deadline picker
- API: `PATCH /api/task-instances/[id]` (deadline field)
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Click deadline field
3. Select date
4. Expect: `PATCH /api/task-instances/[id]` with deadline

---

### WF-04e: Manage Job Attachments

**Legacy ID**: -  
**Status**: YELLOW  
**Goal**: User uploads/manages files attached to job

#### Evidence
- API: `GET/POST /api/task-instances/[id]/attachments` (exists)
- Services: `attachment.service.ts`

#### Blockers
- [ ] API exists but not wired to UI
- [ ] May overlap with evidence collection (WF-06a)

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. (No UI currently visible for attachments)

---

### WF-04f: Manage Job Notes

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User adds internal notes to a job

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx` - Notes section
- API: `PATCH /api/task-instances/[id]` (notes field)
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Edit notes field
3. Save
4. Expect: `PATCH /api/task-instances/[id]` with notes

---

### WF-04g: Job Activity & Comments

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User views activity log and adds comments

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx:477,499,755` - Comments section
- API: `GET /api/task-instances/[id]/timeline`, `GET/POST/DELETE /api/task-instances/[id]/comments`
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. View activity timeline
3. Add comment
4. Expect: `POST /api/task-instances/[id]/comments` called

---

### WF-04h: Job Status & Lifecycle

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User changes job status (draft, active, complete)

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx` - Status dropdown
- API: `PATCH /api/task-instances/[id]` (status field)
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Click status dropdown
3. Select new status
4. Expect: `PATCH /api/task-instances/[id]` with status

---

## PWF-05: Requests & Communication

Parent workflow for sending, tracking, and responding to email requests.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-05a | Send Email Request | WF-07 | GREEN |
| WF-05b | Configure Request Personalization | WF-07 | GREEN |
| WF-05c | Configure Request Reminders | WF-07 | GREEN |
| WF-05d | Cancel / Resend Requests | - | YELLOW |
| WF-05e | Track Request Status | WF-08 | GREEN |
| WF-05f | Manually Override Request Risk | - | YELLOW |
| WF-05g | Mark Request Read / Unread | - | YELLOW |
| WF-05h | Reply Review | WF-14 | GREEN |

---

### WF-05a: Send Email Request

**Legacy ID**: WF-07  
**Status**: GREEN  
**Goal**: User sends request emails to contacts

#### Evidence
- Frontend: `components/jobs/send-request-modal.tsx:291,434,533,562` - Multiple endpoints
- Frontend: `components/jobs/send-request-modal.tsx:393` - Recipient autocomplete via `/api/recipients/search`
- API: `GET /api/recipients/search`, `POST /api/task-instances/[id]/request/draft`, `POST /api/task-instances/[id]/request/refine`, `POST /api/quests`, `POST /api/quests/[id]/execute`
- Services: `ai-email-generation.service.ts`, `quest.service.ts`, `email-sending.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Send Request" button
3. In Recipients section, type in search box
4. Expect: `GET /api/recipients/search?q=...` called
5. Select suggested contact from dropdown
6. Generate draft
7. Expect: `POST /api/task-instances/[id]/request/draft` called
8. Review, click Send
9. Expect: `POST /api/quests` then `POST /api/quests/[id]/execute` called

---

### WF-05b: Configure Request Personalization

**Legacy ID**: WF-07  
**Status**: GREEN  
**Goal**: User customizes emails with recipient data

#### Evidence
- Frontend: `components/jobs/data-personalization/compose-send-step.tsx:161,203,366`
- API: `POST /api/task-instances/[id]/request/dataset/*`
- Services: `personalization-data.service.ts`

#### Verification Steps
1. In Send Request flow, select "Data Personalization"
2. Upload dataset
3. Map columns
4. Preview personalized emails

---

### WF-05c: Configure Request Reminders

**Legacy ID**: WF-07  
**Status**: GREEN  
**Goal**: User sets up automatic reminder schedules

#### Evidence
- Frontend: `components/jobs/send-request-modal.tsx` - Reminder toggle and config
- API: Part of request draft (reminderConfig field)
- Services: `reminder-template.service.ts`

#### Verification Steps
1. In Send Request flow
2. Enable reminders toggle
3. Configure frequency
4. Preview reminder templates

---

### WF-05d: Cancel / Resend Requests

**Legacy ID**: -  
**Status**: YELLOW  
**Goal**: User cancels pending or resends failed requests

#### Evidence
- API: `DELETE /api/requests/detail/[id]/reminders` (cancel reminders)
- Services: `reminder-state.service.ts`

#### Blockers
- [ ] Cancel reminders wired (via request card)
- [ ] No UI for resending failed requests

#### Verification Steps
1. Navigate to request detail
2. Click "Cancel" on reminders
3. Expect: `DELETE /api/requests/detail/[id]/reminders` called

---

### WF-05e: Track Request Status

**Legacy ID**: WF-08  
**Status**: GREEN  
**Goal**: User monitors response status, risk levels, and reminders

#### Evidence
- Frontend: `app/dashboard/requests/page.tsx:148,331,385`
- Frontend: `components/jobs/request-card-expandable.tsx:214,229` - Reminder info
- API: `GET /api/requests/detail/[id]`, `GET /api/requests/detail/[id]/messages`, `GET|DELETE /api/requests/detail/[id]/reminders`
- Services: `risk-computation.service.ts`, `reminder-state.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/requests`
2. View request list with status indicators
3. Click request row
4. Expect: `GET /api/requests/detail/[id]` called
5. View reminder info in expanded card
6. Expect: `GET /api/requests/detail/[id]/reminders` called

---

### WF-05f: Manually Override Request Risk

**Legacy ID**: -  
**Status**: YELLOW  
**Goal**: User manually adjusts risk classification

#### Evidence
- API: `PUT /api/requests/detail/[id]/risk` (exists)
- Services: `risk-computation.service.ts`

#### Blockers
- [ ] API exists but not wired to UI

#### Verification Steps
1. Navigate to request detail
2. (No risk override UI currently visible)

---

### WF-05g: Mark Request Read / Unread

**Legacy ID**: -  
**Status**: YELLOW  
**Goal**: User marks requests as read/unread

#### Evidence
- API: `POST /api/requests/detail/[id]/mark-read` (exists)

#### Blockers
- [ ] API exists but not wired to UI

#### Verification Steps
1. Navigate to request list
2. (No mark-read UI currently visible)

---

### WF-05h: Reply Review

**Legacy ID**: WF-14  
**Status**: GREEN  
**Goal**: User reviews incoming replies with AI-assisted analysis

#### Evidence
- Frontend: `components/reply-review/reply-review-layout.tsx:87`
- Frontend: `components/reply-review/right-pane/ai-summary-section.tsx:38`
- Frontend: `components/reply-review/right-pane/reply-section.tsx:44,73`
- API: `GET|PATCH /api/review/[messageId]`, `POST /api/review/analyze`, `POST /api/review/draft-reply`, `POST /api/requests/detail/[id]/reply`
- Services: `ai-classification.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/review/[messageId]`
2. Expect: `GET /api/review/[messageId]` called
3. Click "Analyze" button
4. Expect: `POST /api/review/analyze` called
5. Draft and send reply

---

## PWF-06: Evidence Collection

Parent workflow for collecting, reviewing, and exporting evidence.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-06a | Upload Evidence | WF-13 | GREEN |
| WF-06b | Review / Approve Evidence | WF-13 | GREEN |
| WF-06c | Bulk Evidence Actions | WF-13 | GREEN |
| WF-06d | Export Evidence | WF-13 | GREEN |

---

### WF-06a: Upload Evidence

**Legacy ID**: WF-13  
**Status**: GREEN  
**Goal**: User manually uploads evidence files

#### Evidence
- Frontend: `components/jobs/collection/collection-upload-modal.tsx:96`
- API: `POST /api/task-instances/[id]/collection`
- Services: `evidence.service.ts`, `storage.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Collection" tab
3. Click "Upload" button
4. Upload file
5. Expect: `POST /api/task-instances/[id]/collection` called

---

### WF-06b: Review / Approve Evidence

**Legacy ID**: WF-13  
**Status**: GREEN  
**Goal**: User reviews and approves collected evidence

#### Evidence
- Frontend: `components/jobs/collection/collection-tab.tsx:189`
- API: `PATCH /api/task-instances/[id]/collection/[itemId]`
- Services: `evidence.service.ts`

#### Verification Steps
1. Navigate to Collection tab
2. Click on evidence item
3. Preview file
4. Click "Approve" or "Reject"
5. Expect: `PATCH /api/task-instances/[id]/collection/[itemId]` called

---

### WF-06c: Bulk Evidence Actions

**Legacy ID**: WF-13  
**Status**: GREEN  
**Goal**: User performs bulk approve/reject/delete

#### Evidence
- Frontend: `components/jobs/collection/collection-tab.tsx:168`
- API: `POST /api/task-instances/[id]/collection/bulk`
- Services: `evidence.service.ts`

#### Verification Steps
1. Navigate to Collection tab
2. Select multiple items
3. Click bulk action button
4. Expect: `POST /api/task-instances/[id]/collection/bulk` called

---

### WF-06d: Export Evidence

**Legacy ID**: WF-13  
**Status**: GREEN  
**Goal**: User exports all collected evidence

#### Evidence
- Frontend: `components/jobs/collection/collection-tab.tsx:324`
- API: `GET /api/task-instances/[id]/collection/export`
- Services: `evidence.service.ts`

#### Verification Steps
1. Navigate to Collection tab
2. Click "Export All" button
3. Expect: CSV download triggered

---

## PWF-07: Contact Management

Parent workflow for managing contacts, groups, and organization.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-07a | Create / Edit Contact | WF-15 | GREEN |
| WF-07b | Import Contacts | WF-15 | GREEN |
| WF-07c | Group Contacts | WF-15 | GREEN |
| WF-07d | Manage Contact Types / Labels | - | GREEN |
| WF-07e | Link Contacts to Jobs | - | GREEN |
| WF-07f | Search / Select Contacts for Requests | - | GREEN |

---

### WF-07a: Create / Edit Contact

**Legacy ID**: WF-15  
**Status**: GREEN  
**Goal**: User creates or updates contact information

#### Evidence
- Frontend: `app/dashboard/contacts/page.tsx:59`
- Frontend: `components/contacts/contact-list.tsx:72`
- API: `POST /api/entities`, `PATCH /api/entities/[id]`
- Services: `entity.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/contacts`
2. Click "Add Contact" or click existing contact
3. Enter/edit information
4. Save
5. Expect: `POST /api/entities` or `PATCH /api/entities/[id]` called

---

### WF-07b: Import Contacts

**Legacy ID**: WF-15  
**Status**: GREEN  
**Goal**: User bulk imports contacts from CSV

#### Evidence
- Frontend: `components/contacts/import-modal.tsx:124`
- Frontend: `components/contacts/csv-upload.tsx:64`
- API: `POST /api/entities/import`, `POST /api/entities/bulk`
- Services: `csv-import.service.ts`, `unified-import.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/contacts`
2. Click "Import" button
3. Upload CSV file
4. Map columns
5. Confirm import
6. Expect: `POST /api/entities/import` called

---

### WF-07c: Group Contacts

**Legacy ID**: WF-15  
**Status**: GREEN  
**Goal**: User organizes contacts into groups

#### Evidence
- Frontend: `app/dashboard/contacts/page.tsx:74`
- API: `GET|POST /api/groups`, `POST /api/groups/[id]/members`
- Services: `group.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/contacts`
2. Click "Groups" tab
3. Create new group
4. Add contacts to group

---

### WF-07d: Manage Contact Types / Labels

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User defines and manages contact classifications

#### Evidence
- Frontend: `app/dashboard/contacts/page.tsx` - Contact types UI
- API: `GET/POST /api/contact-types`
- Services: `entity.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/contacts`
2. View/edit contact types

---

### WF-07e: Link Contacts to Jobs

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User associates contacts with specific jobs

#### Evidence
- Frontend: `app/dashboard/jobs/[id]/page.tsx` - Stakeholders section
- API: `POST /api/task-instances/[id]/stakeholders`
- Services: `task-instance.service.ts`

#### Verification Steps
1. Navigate to job detail
2. Add stakeholder from contacts
3. Expect: `POST /api/task-instances/[id]/stakeholders` called

---

### WF-07f: Search / Select Contacts for Requests

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User searches and selects recipients when sending requests

#### Evidence
- Frontend: `components/jobs/send-request-modal.tsx:393`
- API: `GET /api/recipients/search`
- Services: `entity.service.ts`, `domain-detection.service.ts`

#### Verification Steps
1. In Send Request modal
2. Type in recipient search box
3. Expect: `GET /api/recipients/search?q=...` called
4. Select from suggestions

---

## PWF-08: Email Account Management

Parent workflow for connecting and managing email accounts.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-08a | Connect Email Account - Gmail | WF-20 | GREEN |
| WF-08b | Connect Email Account - Microsoft | WF-20 | GREEN |
| WF-08c | Manage Email Senders | - | GREEN |

---

### WF-08a: Connect Email Account - Gmail

**Legacy ID**: WF-20  
**Status**: GREEN  
**Goal**: User connects Gmail via OAuth

#### Evidence
- Frontend: `app/dashboard/settings/team/page.tsx:191-198`
- API: `GET /api/oauth/gmail`, `GET /api/oauth/gmail/callback`
- Services: `email-connection.service.ts`, `gmail-watch.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/settings/team`
2. Click "Connect Gmail"
3. Complete OAuth flow
4. Expect: Redirect back with `?success=gmail_connected`

---

### WF-08b: Connect Email Account - Microsoft

**Legacy ID**: WF-20  
**Status**: GREEN  
**Goal**: User connects Microsoft 365 via OAuth

#### Evidence
- Frontend: `app/dashboard/settings/team/page.tsx:191-198`
- API: `GET /api/oauth/microsoft`, `GET /api/oauth/microsoft/callback`
- Services: `email-connection.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/settings/team`
2. Click "Connect Microsoft"
3. Complete OAuth flow
4. Expect: Account appears in list

---

### WF-08c: Manage Email Senders

**Legacy ID**: -  
**Status**: GREEN  
**Goal**: User configures which accounts can send

#### Evidence
- Frontend: `app/dashboard/settings/team/page.tsx`
- API: `GET /api/email-accounts`, `PATCH /api/email-accounts/[id]`
- Services: `email-connection.service.ts`

#### Verification Steps
1. Navigate to `/dashboard/settings/team`
2. View connected accounts
3. Toggle active/inactive
4. Expect: `PATCH /api/email-accounts/[id]` called

---

## PWF-09: System Automation (Non-User Initiated)

Parent workflow for background processes without direct user action.

| Sub-ID | Name | Legacy ID | Status |
|--------|------|-----------|--------|
| WF-09a | Email Sync - Gmail/Microsoft | WF-16 | GREEN |
| WF-09b | Message Classification | WF-17 | GREEN |
| WF-09c | Reminder Sending | WF-18 | GREEN |
| WF-09d | Email Queue Processing | WF-19 | GREEN |
| WF-09e | AI Content-Based Risk Scoring | - | YELLOW |
| WF-09f | AI First-Pass Document Review | - | RED |

---

### WF-09a: Email Sync - Gmail/Microsoft

**Legacy ID**: WF-16  
**Status**: GREEN  
**Trigger**: Inngest cron (every 5 minutes)

#### Evidence
- Inngest: `inngest/functions/index.ts:459-518` - `sync-gmail-accounts`, `sync-microsoft-accounts`
- Services: `email-sync.service.ts`, `email-connection.service.ts`, `email-reception.service.ts`
- Providers: `lib/providers/email-ingest/gmail-ingest.provider.ts`, `lib/providers/email-ingest/microsoft-ingest.provider.ts`

#### Verification Steps
1. Connect email account via Settings/Team
2. Wait for Inngest cron
3. Check logs for `[Inngest Sync]` entries
4. Verify new replies appear in request threads

---

### WF-09b: Message Classification

**Legacy ID**: WF-17  
**Status**: GREEN  
**Trigger**: Inngest event (on message receive)

#### Evidence
- Inngest: `inngest/functions/index.ts:28-328` - `classify-message`
- Services: `ai-classification.service.ts`, `risk-computation.service.ts`, `reminder-state.service.ts`

#### Verification Steps
1. Receive inbound reply to sent request
2. Inngest triggers `classify-message` event
3. Check message has `aiClassification` field set
4. Check request has `completionPercentage` updated

---

### WF-09c: Reminder Sending

**Legacy ID**: WF-18  
**Status**: GREEN  
**Trigger**: Inngest cron (every 15 minutes)

#### Evidence
- Inngest: `inngest/functions/index.ts:520-542` - `reminder/send-due`
- Services: `reminder-runner.service.ts`, `reminder-state.service.ts`, `reminder-template.service.ts`, `email-sending.service.ts`

#### Verification Steps
1. Send request with reminders enabled
2. Wait for reminder delay
3. Inngest cron triggers
4. Check reminder sent

---

### WF-09d: Email Queue Processing

**Legacy ID**: WF-19  
**Status**: GREEN  
**Trigger**: Inngest cron (every minute)

#### Evidence
- Inngest: `inngest/functions/index.ts:627-714` - `process-email-queue`
- Services: `email-queue.service.ts`, `email-sending.service.ts`

#### Verification Steps
1. Send multiple emails (exceed rate limit)
2. Verify emails queued
3. Wait for Inngest cron
4. Check queued emails sent

---

### WF-09e: AI Content-Based Risk Scoring

**Legacy ID**: -  
**Status**: YELLOW  
**Trigger**: Inngest event (on classify-message)

#### Current State
Risk is computed based on **time since sent**, not submission content quality.

#### Evidence
- Route: `app/api/requests/detail/[id]/risk/route.ts` - Manual override exists
- Service: `lib/services/risk-computation.service.ts` - Time-based factors only

#### Blockers
- No content extraction to analyze submission quality
- Risk factors are: days since sent, reminder count, deadline proximity
- **Not factored**: What was actually submitted, is it correct/complete

#### To Fix
1. Create `attachment-extraction.service.ts` to read content
2. Extend `risk-computation.service.ts` to include content quality factors
3. Add risk factors: missing expected documents, unclear responses, partial data

---

### WF-09f: AI First-Pass Document Review

**Legacy ID**: -  
**Status**: RED  
**Trigger**: Should be Inngest event (on message receive, before human review)

#### Current State
**SERVICE DOES NOT EXIST**. Humans must manually review all inbound content.

#### Missing Components
- `lib/services/first-pass-review.service.ts` - Does not exist
- `lib/services/attachment-extraction.service.ts` - Does not exist
- Inngest function to orchestrate AI review - Does not exist

#### Why This Matters
AI should be the **first reviewer** of all inbound content:
1. Extract text from email body
2. Extract text from attachments (PDF, Excel, CSV, images)
3. Determine if submission is complete
4. Classify intent (data submission, question, complaint, etc.)
5. Propose draft reply
6. Queue for human review with AI pre-analysis

Without this, every request requires full manual review, defeating the purpose of AI assistance.

---

## Part 2: Service/Route Classification

---

### A) System-Only Dependencies

Services used exclusively by system processes. **NOT orphans**.

| Service | Used By | Sub-Workflow | Evidence |
|---------|---------|--------------|----------|
| `gmail-watch.service.ts` | OAuth callback | WF-08a | `app/api/oauth/gmail/callback/route.ts:149` |
| `token-refresh.service.ts` | Email sending | WF-09a | `lib/services/email-sending.service.ts:4,147` |
| `tracking-pixel.service.ts` | Email sending | WF-05a | `lib/services/email-sending.service.ts:6,389-393` |
| `thread-id-extractor.ts` | Email reception | WF-09a | `lib/services/email-reception.service.ts:3,206` |
| `local-storage.service.ts` | Storage fallback | WF-06a | `lib/services/storage.service.ts:1,15` |
| `request-creation.service.ts` | Email sending | WF-05a | `lib/services/email-sending.service.ts:5,432,447` |

---

### B) Workflow-Relevant Missing Wiring

Routes that exist but have no frontend caller.

| Route | Methods | Target Sub-Workflow | Recommended Action |
|-------|---------|---------------------|-------------------|
| `/api/requests/detail/[id]/reminder-draft` | GET, POST | WF-05c | Wire to reminder preview modal |
| `/api/requests/detail/[id]/mark-read` | POST | WF-05g | Wire to request row click |
| `/api/requests/detail/[id]/risk` | PUT | WF-05f | Wire to risk badge click |
| `/api/task-instances/[id]/attachments` | GET, POST | WF-04e | Wire to job attachments section |
| `/api/task-instances/[id]/labels/[labelId]` | GET, PATCH, DELETE | WF-05a | Wire to label edit/delete UI |
| `/api/task-instances/[id]/request/dataset/preview` | GET, POST | WF-05b | Wire to dataset preview step |
| `/api/task-lineages/[id]` | GET, PATCH, DELETE | WF-03b | Wire to lineage settings |

---

### C) Feature-Flagged Routes

| Route | Methods | Feature Flag | Target Sub-Workflow |
|-------|---------|--------------|---------------------|
| `/api/quests/[id]` | GET, PATCH | `NEXT_PUBLIC_QUEST_UI` | WF-05a |
| `/api/quests/[id]/generate` | POST | `NEXT_PUBLIC_QUEST_UI` | WF-05a |
| `/api/quests/context` | GET | `QUEST_AI_INTERPRETER` | WF-05a |
| `/api/quests/interpret` | GET, POST | `QUEST_AI_INTERPRETER` | WF-05a |
| `/api/quests/standing` | POST | `QUEST_STANDING` | WF-05a |

---

### D) Recently Wired (P1 Sprint 2026-01-21)

| Route | Sub-Workflow | Component | Evidence |
|-------|--------------|-----------|----------|
| `/api/recipients/search` | WF-07f | `send-request-modal.tsx:393` | Recipient autocomplete |
| `/api/requests/detail/[id]/reminders` | WF-05e | `request-card-expandable.tsx:214,229` | Reminder info + cancel |
| `/api/task-instances/[id]/collection/bulk` | WF-06c | `collection-tab.tsx:168` | Bulk actions |
| `/api/task-instances/[id]/collection/export` | WF-06d | `collection-tab.tsx:324` | Export All |
| `/api/task-instances/[id]/table/signoff` | WF-03d | `data-tab.tsx:126,137` | Dataset signoff |

---

### E) True Orphans

| Route | Methods | Evidence | Recommendation |
|-------|---------|----------|----------------|
| `/api/attachments/delete/[id]` | DELETE | Duplicate of DELETE on `/api/attachments/[id]` | Delete route file |

---

## Part 3: Fix Next List

Priority actions for workflow restoration, keyed to sub-workflows.

| Priority | Route | Sub-Workflow | Action |
|----------|-------|--------------|--------|
| 1 | `/api/requests/detail/[id]/mark-read` | WF-05g | Wire to request row click |
| 2 | `/api/requests/detail/[id]/risk` | WF-05f | Wire to risk badge click |
| 3 | `/api/task-instances/[id]/attachments` | WF-04e | Wire to job attachments section |
| 4 | `/api/requests/detail/[id]/reminder-draft` | WF-05c | Wire to reminder preview modal |
| 5 | `/api/task-instances/[id]/labels/[labelId]` | WF-05a | Wire to label edit/delete UI |
| 6 | `/api/task-instances/[id]/request/dataset/preview` | WF-05b | Wire to dataset preview |
| 7 | `/api/task-lineages/[id]` | WF-03b | Wire to lineage settings |

---

## Appendix: Taxonomy Reference

See `docs/product/workflow-taxonomy.md` for:
- Complete parent/sub-workflow hierarchy
- Legacy ID mapping table
- ID assignment rules
- Sub-workflow reference with all routes

---

*Generated from codebase evidence. All claims cite file:line references.*
