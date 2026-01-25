# Frontend-Backend Contract

> **Living Document** - Last updated: 2026-01-25  
> **Purpose**: Map all frontend pages to backend API routes with evidence-based classifications.  
> **Taxonomy Reference**: `docs/product/workflow-taxonomy.md`

---

## Table of Contents

- [Job Capabilities (Non-Schema Concept)](#job-capabilities-non-schema-concept)
- [Section A: Page-to-Workflow Mapping](#section-a-page-to-workflow-mapping)
- [Section B: Classification Model](#section-b-classification-model)
- [Section C: API Route Inventory](#section-c-api-route-inventory)
- [Section D: Orphan Triage](#section-d-orphan-triage)
- [Section E: Top 10 Fix-Next Recommendations](#section-e-top-10-fix-next-recommendations)
- [Section F: Rules of the Road](#section-f-rules-of-the-road)
- [Section G: Drift Check Commands](#section-g-drift-check-commands)

---

## Job Capabilities (Non-Schema Concept)

> **This is a documentation-only concept.** No schema changes are required. All existing code continues to work unchanged.

### Core Principle

**Jobs are containers; capabilities define behavior.**

A Job (TaskInstance) is the atomic unit in the system. Rather than having different "types" of jobs, we think of jobs as containers that have one or more **capabilities** enabled.

### Capability Definitions

| Capability | Description | API Route Patterns | Workflows |
|------------|-------------|-------------------|-----------|
| **Core** | Basic job operations available to all jobs | `/api/task-instances/[id]`, `/api/task-instances/[id]/collaborators`, `/api/task-instances/[id]/comments` | WF-03a, WF-03f, WF-03g, WF-04a-h |
| **Table** | Structured data, schema, import, variance | `/api/task-instances/[id]/table/*`, `/api/task-lineages/[id]/schema` | WF-03b, WF-03d, WF-03e |
| **Reconciliation** | Document comparison, anchor/supporting model | `/api/task-instances/[id]/reconciliations/*` | WF-03c, WF-03h, WF-03i |
| **Request** | Email communication, reminders, tracking | `/api/task-instances/[id]/request/*`, `/api/requests/*`, `/api/review/*` | WF-05a-r |
| **Evidence** | File collection, review, export | `/api/task-instances/[id]/collection/*` | WF-06a-e |
| **Data** | Opt-in spreadsheet data management with custom columns/rows, Excel-style cell formulas with auto-expansion, and period navigation | `/api/task-instances/[id]/data/*`, `/api/datasets/*`, `/api/task-lineages/[id]/app-columns/*`, `/api/task-lineages/[id]/app-rows/*`, `/api/task-lineages/[id]/cell-formulas` | WF-10a-s |

### UI Terminology Mapping

Some internal terms differ from user-facing labels to reflect accounting workflows:

| Internal Term | User-Facing Label | Notes |
|--------------|-------------------|-------|
| `TaskType.DATABASE` | **Variance** | Displays as "Variance" in badges, dropdowns, and UI. Internal enum remains `DATABASE`. |
| `TaskType.TABLE` | **Table / Variance Task** | Combined option in job creation. |

> **Important**: This is a **language change only**. Backend enums, API payloads, and service logic remain unchanged.

### Why This Model

1. **No new "Job types"**: Don't create `ReconciliationJob`, `TableJob`, etc. Use capabilities instead.
2. **Capabilities are independent**: Request capability doesn't depend on Table capability.
3. **Safe refactoring**: Target a capability without affecting the Job container.
4. **Cursor safety**: Reduces AI hallucination of new abstractions.

### What Is NOT a Capability

- **Approval workflows**: OUT OF SCOPE for this taxonomy. Will be layered separately in a future phase.
- **Board operations**: Boards contain Jobs but are not Job capabilities.
- **Authentication/Contacts**: System-level concerns, not Job behavior.

### Developer Guardrails

```
CRITICAL: Job Stability Rules

1. Do NOT introduce new Job types. Extend via capabilities.
2. Do NOT rename Job, Board, TaskInstance, or Organization.
3. Do NOT refactor the Job container itself. Target capabilities.
4. Capabilities may evolve independently.
5. Approval logic is OUT OF SCOPE for this version.
```

---

## Draft Request Handling (Period Rollover)

> **Last Updated**: 2026-01-22  
> **Scope**: Recurring request drafts copied during board period rollover

### Overview

When a board completes and auto-creates the next period (WF-02l, WF-02m), active requests from the previous period are copied forward as **draft requests** on the new job. These drafts require user review before sending.

### Canonical API Endpoint

**All draft request operations are handled through the existing endpoint:**

```
/api/task-instances/[id]/requests
```

| Operation | Method | Query/Body | Evidence |
|-----------|--------|------------|----------|
| List drafts | GET | `?includeDrafts=true` | `app/dashboard/jobs/[id]/page.tsx:429-430` |
| Update draft | POST | `{ requestId, action: "update", subject?, body?, entityId? }` | `components/jobs/draft-request-review-modal.tsx:122-131` |
| Send draft | POST | `{ requestId, action: "send", remindersApproved? }` | `components/jobs/draft-request-review-modal.tsx:159-168` |
| Delete draft | DELETE | `{ requestId }` (body) | `components/jobs/draft-request-review-modal.tsx:181-193` |

### UI Entry Point

Draft requests are surfaced in the **Job Detail Header** (not in table cells):

| Location | Evidence | Behavior |
|----------|----------|----------|
| Job header badge | `app/dashboard/jobs/[id]/page.tsx:1148-1160` | Shows amber badge "{N} draft(s) to review" when drafts exist |
| Badge click | `app/dashboard/jobs/[id]/page.tsx:1152-1153` | Opens `DraftRequestReviewModal` |
| Modal component | `components/jobs/draft-request-review-modal.tsx:84-91` | Review, edit, send, or delete drafts |

### Response Shape

```typescript
// GET /api/task-instances/[id]/requests?includeDrafts=true
{
  success: true,
  requests: [...],        // Existing EmailDraft-based requests
  draftRequests: [...],   // Draft Request records with resolved content
  hasDrafts: boolean      // Convenience flag
}
```

### Services Involved

| Service | Purpose | File |
|---------|---------|------|
| `RequestDraftCopyService` | Copy-on-write pattern for draft content | `lib/services/request-draft-copy.service.ts` |
| `BusinessDayService` | Period-aware scheduling computation | `lib/services/business-day.service.ts` |

### Key Behaviors

1. **Drafts are NOT auto-sent**: User must explicitly send each draft
2. **Copy-on-write content**: Source request content is referenced until user edits
3. **Recipients must be reviewed**: Stakeholders may change between periods
4. **Reminders require re-approval**: User must opt-in to reminders for each draft

### Related Workflows

- WF-02l: Auto-Create Next Period Board (triggers draft copy)
- WF-02m: Copy Tasks to Next Period (copies job structure)
- WF-05o: Review Draft Requests (new - documented below)
- WF-05p: Edit Draft Request (new - documented below)
- WF-05q: Send Draft Request (new - documented below)
- WF-05r: Delete Draft Request (new - documented below)

---

## Section A: Page-to-Workflow Mapping

### Dashboard Pages

| Page | URL | Parent Workflow | Sub-Workflows | Key APIs |
|------|-----|-----------------|---------------|----------|
| Jobs List | `/dashboard/jobs` | PWF-03: Job Lifecycle | WF-02c, WF-03a, WF-03b, WF-03c, WF-03f, WF-03g | `/api/task-instances`, `/api/boards/*`, `/api/org/team` |
| Job Detail | `/dashboard/jobs/[id]` | PWF-03, PWF-04, PWF-05, PWF-06 | WF-03d, WF-03e, WF-04a-h, WF-05a-c, WF-06a-d | `/api/task-instances/[id]/*`, `/api/requests/*` |
| Boards | `/dashboard/boards` | PWF-02: Board Management | WF-02a, WF-02b, WF-02d, WF-02e, WF-02f, WF-02g, WF-02h | `/api/boards`, `/api/boards/[id]`, `/api/boards/team-members` |
| Contacts | `/dashboard/contacts` | PWF-07: Contact Management | WF-07a, WF-07b, WF-07c, WF-07d | `/api/entities/*`, `/api/groups/*`, `/api/contacts/*` |
| Requests | `/dashboard/requests` | PWF-05: Requests & Communication | WF-05d, WF-05e, WF-05f, WF-05g | `/api/requests/detail/*`, `/api/boards` |
| Collection | `/dashboard/collection` | PWF-06: Evidence Collection | WF-06a, WF-06b, WF-06c, WF-06d | `/api/collection`, `/api/boards` |
| Collection/Invoices | `/dashboard/collection/invoices` | PWF-06: Evidence Collection | WF-06a, WF-06b | `/api/boards` |
| Collection/Expenses | `/dashboard/collection/expenses` | PWF-06: Evidence Collection | WF-06a, WF-06b | `/api/boards` |
| Review | `/dashboard/review/[messageId]` | PWF-05: Requests & Communication | WF-05h | `/api/review/*`, `/api/requests/detail/[id]/reply*` |
| Settings | `/dashboard/settings` | - | - | `/api/org/settings`, `/api/user/signature` |
| Settings/Team | `/dashboard/settings/team` | PWF-08: Email Account Management | WF-08a, WF-08b, WF-08c | `/api/org/users/*`, `/api/email-accounts/*` |
| Settings/Accounting | `/dashboard/settings/accounting` | - | - | `/api/org/accounting-calendar` |

### Auth Pages

| Page | URL | Parent Workflow | Sub-Workflow | Key APIs |
|------|-----|-----------------|--------------|----------|
| Sign In | `/auth/signin` | PWF-01: Authentication | WF-01b | NextAuth (no direct API) |
| Sign Up | `/signup` | PWF-01: Authentication | WF-01a | `/api/auth/signup` |
| Accept Invite | `/auth/accept-invite` | PWF-01: Authentication | WF-01d | `/api/auth/accept-invite` |
| Forgot Password | `/auth/forgot-password` | PWF-01: Authentication | WF-01c | `/api/auth/forgot-password` |
| Reset Password | `/auth/reset-password` | PWF-01: Authentication | WF-01c | `/api/auth/reset-password` |
| Verify Email | `/auth/verify-email` | PWF-01: Authentication | WF-01a | `/api/auth/verify` |

### Info Pages

| Page | URL | Workflow | APIs |
|------|-----|----------|------|
| Landing | `/` | None | None |
| Privacy | `/privacy` | None | None |
| Terms | `/terms` | None | None |

---

## Section B: Classification Model

Every route has two classification fields:

### Caller Type

| Type | Definition | Evidence Required |
|------|------------|-------------------|
| `FRONTEND` | Called directly from `app/` or `components/` via `fetch()` | file:line with fetch call |
| `SYSTEM` | Called by Inngest functions or internal cron jobs | Inngest function name |
| `ADMIN` | Admin-only endpoints, no UI | Route path starts with `/api/admin/` |
| `EXTERNAL` | Called by external systems (webhooks, OAuth providers) | External system name |
| `TEST_ONLY` | Only called from test files | test file:line |
| `UNKNOWN` | No caller evidence found | Verification command provided |

### Call Style

| Style | Definition |
|-------|------------|
| `DIRECT_FETCH` | Frontend code calls route via `fetch('/api/...')` |
| `URL_GENERATION` | Service generates URL that browser/client uses directly |
| `INTERNAL` | System/webhook/OAuth callback |
| `NONE` | No callers detected |

---

## Section C: API Route Inventory

### FRONTEND Routes (83 routes)

Routes with verified `fetch()` calls from `app/` or `components/`.

| Route | Methods | Caller Type | Call Style | Evidence |
|-------|---------|-------------|------------|----------|
| `/api/auth/accept-invite` | GET, POST | FRONTEND | DIRECT_FETCH | `app/auth/accept-invite/page.tsx:42,84` |
| `/api/auth/forgot-password` | POST | FRONTEND | DIRECT_FETCH | `app/auth/forgot-password/page.tsx:20` |
| `/api/auth/reset-password` | GET, POST | FRONTEND | DIRECT_FETCH | `app/auth/reset-password/page.tsx:33,69` |
| `/api/auth/signup` | POST | FRONTEND | DIRECT_FETCH | `app/signup/page.tsx:48` |
| `/api/auth/verify` | GET | FRONTEND | DIRECT_FETCH | `app/auth/verify-email/page.tsx:27` |
| `/api/boards` | GET, POST | FRONTEND | DIRECT_FETCH | `app/dashboard/boards/page.tsx:255,452` |
| `/api/boards/[id]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/boards/page.tsx:273,400,416,438,474` |
| `/api/boards/team-members` | GET | FRONTEND | DIRECT_FETCH | `components/boards/create-board-modal.tsx:175` |
| `/api/collection` | GET, PATCH | FRONTEND | DIRECT_FETCH | `app/dashboard/collection/page.tsx:159` |
| `/api/collection/preview/[id]` | GET | FRONTEND | URL_GENERATION | `components/jobs/collection/collection-tab.tsx:478`, `components/reply-review/left-pane/attachments-tab.tsx:184` |
| `/api/contacts/custom-types` | POST, DELETE | FRONTEND | DIRECT_FETCH | `components/contacts/bulk-action-toolbar.tsx:97` |
| `/api/contacts/type-counts` | GET | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:523` |
| `/api/email-accounts` | GET | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:217` |
| `/api/email-accounts/[id]` | DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/settings/team/page.tsx:204` |
| `/api/entities` | GET, POST | FRONTEND | DIRECT_FETCH | `app/dashboard/contacts/page.tsx:59` |
| `/api/entities/[id]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/contacts/contact-list.tsx:72` |
| `/api/entities/bulk` | POST | FRONTEND | DIRECT_FETCH | `components/contacts/csv-upload.tsx:64` |
| `/api/entities/bulk-update` | POST | FRONTEND | DIRECT_FETCH | `components/contacts/bulk-action-toolbar.tsx:134` |
| `/api/entities/import` | POST | FRONTEND | DIRECT_FETCH | `components/contacts/import-modal.tsx:124` |
| `/api/groups` | GET, POST | FRONTEND | DIRECT_FETCH | `app/dashboard/contacts/page.tsx:74` |
| `/api/groups/[id]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/contacts/groups-manager.tsx:63,91` |
| `/api/org/accounting-calendar` | GET, PUT | FRONTEND | DIRECT_FETCH | `app/dashboard/settings/accounting/page.tsx:44,61` |
| `/api/org/settings` | GET, PUT | FRONTEND | DIRECT_FETCH | `app/dashboard/settings/page.tsx:28,44` |
| `/api/org/team` | GET | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/page.tsx:211` |
| `/api/org/users` | GET, POST | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:571` |
| `/api/org/users/[id]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/settings/team/page.tsx:275,313` |
| `/api/quests` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:533` |
| `/api/quests/[id]/execute` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:562` |
| `/api/requests` | GET | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:392` |
| `/api/requests/detail/[id]` | GET, PATCH | FRONTEND | DIRECT_FETCH | `app/dashboard/requests/page.tsx:148` |
| `/api/requests/detail/[id]/messages` | GET | FRONTEND | DIRECT_FETCH | `app/dashboard/requests/page.tsx:331,385` |
| `/api/requests/detail/[id]/reminders` | GET, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/request-card-expandable.tsx:214,229` |
| `/api/requests/detail/[id]/reply` | POST | FRONTEND | DIRECT_FETCH | `components/reply-review/right-pane/reply-section.tsx:73` |
| `/api/requests/detail/[id]/reply-draft` | POST | FRONTEND | DIRECT_FETCH | `components/reply-review/right-pane/reply-section.tsx:44` |
| `/api/recipients/search` | GET | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:393` |
| `/api/review/[messageId]` | GET, PATCH | FRONTEND | DIRECT_FETCH | `components/reply-review/reply-review-layout.tsx:87` |
| `/api/review/analyze` | POST | FRONTEND | DIRECT_FETCH | `components/reply-review/right-pane/ai-summary-section.tsx:38` |
| `/api/review/draft-reply` | POST | FRONTEND | DIRECT_FETCH | `components/reply-review/right-pane/review-rhs.tsx:120` |
| `/api/task-instances` | GET, POST | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/page.tsx:179,376,443,505` |
| `/api/task-instances/[id]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:357,639,668` |
| `/api/task-instances/[id]/ai-summary` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/task-ai-summary.tsx:67` |
| `/api/task-instances/[id]/collaborators` | GET, POST, DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:559,817,836` |
| `/api/task-instances/[id]/collection` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/collection/collection-upload-modal.tsx:96` |
| `/api/task-instances/[id]/collection/[itemId]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/collection/collection-tab.tsx:189` |
| `/api/task-instances/[id]/collection/download` | GET | FRONTEND | DIRECT_FETCH | `app/dashboard/collection/page.tsx:186`, `components/jobs/collection/collection-tab.tsx:166`, `components/review/attachment-preview.tsx:61` |
| `/api/task-instances/[id]/collection/bulk` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/collection/collection-tab.tsx:168` |
| `/api/task-instances/[id]/collection/export` | GET | FRONTEND | URL_GENERATION | `components/jobs/collection/collection-tab.tsx:324` |
| `/api/task-instances/[id]/comments` | GET, POST, DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:421,755` |
| `/api/task-instances/[id]/contact-labels` | GET, POST, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/contact-labels-table.tsx:28` |
| `/api/task-instances/[id]/labels` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:246` |
| `/api/task-instances/[id]/reconciliations` | GET, POST | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:433` |
| `/api/task-instances/[id]/request/dataset` | GET, PATCH | FRONTEND | DIRECT_FETCH | `components/jobs/data-personalization/compose-send-step.tsx:283,326` |
| `/api/task-instances/[id]/request/dataset/draft` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/data-personalization/compose-send-step.tsx:161,203` |
| `/api/task-instances/[id]/request/dataset/send` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/data-personalization/compose-send-step.tsx:366` |
| `/api/task-instances/[id]/request/dataset/upload` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/data-personalization/upload-step.tsx:204` |
| `/api/task-instances/[id]/request/draft` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:291` |
| `/api/task-instances/[id]/request/refine` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:434` |
| `/api/task-instances/[id]/request/reminder-preview` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/send-request-modal.tsx:397` |
| `/api/task-instances/[id]/requests` | GET, POST, DELETE | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:407`, `components/jobs/draft-request-review-modal.tsx:122,154,181` (GET supports `?includeDrafts=true`, POST handles draft send/update, DELETE for draft deletion) |
| `/api/task-instances/[id]/table/cell` | PATCH | FRONTEND | DIRECT_FETCH | `components/jobs/table/data-tab.tsx:135` |
| `/api/task-instances/[id]/table/compare` | GET | FRONTEND | DIRECT_FETCH | `components/jobs/table/compare-view.tsx:81` |
| `/api/task-instances/[id]/table/import` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/table/import-modal.tsx:328` |
| `/api/task-instances/[id]/table/preview-import` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/table/import-modal.tsx:297` |
| `/api/task-instances/[id]/table/rows` | GET | FRONTEND | DIRECT_FETCH | `components/jobs/table/data-tab.tsx:67` |
| `/api/task-instances/[id]/table/signoff` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/table/data-tab.tsx:126,137` |
| `/api/task-instances/[id]/timeline` | GET | FRONTEND | DIRECT_FETCH | `app/dashboard/jobs/[id]/page.tsx:445` |
| `/api/task-instances/ai-generate` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/ai-bulk-upload-modal.tsx:79` |
| `/api/task-instances/ai-summary` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/ai-summary-panel.tsx:41` |
| `/api/task-instances/bulk-import` | POST | FRONTEND | DIRECT_FETCH | `components/jobs/ai-bulk-upload-modal.tsx:217` |
| `/api/task-instances/column-config` | GET, PATCH | FRONTEND | DIRECT_FETCH | `components/jobs/configurable-table/configurable-table.tsx:186,209` |
| `/api/task-instances/template` | GET | FRONTEND | URL_GENERATION | `components/jobs/ai-bulk-upload-modal.tsx:310` (window.open) |
| `/api/task-lineages/[id]/schema` | GET, PATCH | FRONTEND | DIRECT_FETCH | `components/jobs/table/data-tab.tsx:93,116` |
| `/api/task-lineages/[id]/app-columns` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10g) |
| `/api/task-lineages/[id]/app-columns/[columnId]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10j) |
| `/api/task-lineages/[id]/app-columns/[columnId]/values` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10h) |
| `/api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10h) |
| `/api/task-lineages/[id]/app-rows` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10k) |
| `/api/task-lineages/[id]/app-rows/[rowId]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10m) |
| `/api/task-lineages/[id]/app-rows/[rowId]/values` | GET, POST | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10l) |
| `/api/task-lineages/[id]/app-rows/[rowId]/values/[columnIdentity]` | GET, PATCH, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10l) |
| `/api/task-lineages/[id]/cell-formulas` | GET, POST, DELETE | FRONTEND | DIRECT_FETCH | `components/jobs/data/data-tab-universal.tsx` (WF-10q, WF-10r, WF-10s) |
| `/api/templates/contacts` | GET | FRONTEND | URL_GENERATION | `components/contacts/import-modal.tsx:156` (href link) |
| `/api/user/onboarding` | GET, POST | FRONTEND | DIRECT_FETCH | `components/onboarding-checklist.tsx:91,109` |
| `/api/user/signature` | GET, PUT | FRONTEND | DIRECT_FETCH | `app/dashboard/settings/page.tsx:68,84` |

### ADMIN Routes (18 routes)

Routes restricted to admin users. Caller Type: `ADMIN`, Call Style: `INTERNAL`.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/backfill-completion` | POST | Backfill completion percentages |
| `/api/admin/backfill-file-urls` | GET | Backfill file URLs |
| `/api/admin/backfill-risk` | POST | Backfill risk computations |
| `/api/admin/check-replies` | GET | Check for new replies |
| `/api/admin/cleanup-requests` | POST | Clean up orphan requests |
| `/api/admin/debug-accounts` | GET, POST | Debug email accounts |
| `/api/admin/debug-blob` | GET | Debug blob storage |
| `/api/admin/debug-collection` | GET | Debug collected items |
| `/api/admin/debug-email-sync` | GET | Debug email sync |
| `/api/admin/debug-messages` | GET, POST | Debug messages |
| `/api/admin/debug/[taskId]` | GET | Debug specific task |
| `/api/admin/delete-user` | GET, DELETE | Delete user (dangerous) |
| `/api/admin/health-check` | GET | System health check |
| `/api/admin/migrate` | POST | Run migrations |
| `/api/admin/pipeline-status` | GET | View pipeline status |
| `/api/admin/reminders/run-once` | POST | Trigger reminders manually |
| `/api/admin/sync-emails` | POST | Trigger email sync |
| `/api/admin/sync-gmail-now` | POST | Trigger Gmail sync |

### EXTERNAL Routes (8 routes)

Routes called by external systems. Caller Type: `EXTERNAL`, Call Style: `INTERNAL`.

| Route | Methods | Purpose | External Caller |
|-------|---------|---------|-----------------|
| `/api/auth/[...nextauth]` | ALL | NextAuth authentication | NextAuth.js framework |
| `/api/inngest` | ALL | Inngest webhook handler | Inngest Cloud |
| `/api/oauth/gmail` | GET | Gmail OAuth initiation | Browser redirect |
| `/api/oauth/gmail/callback` | GET | Gmail OAuth callback | Google OAuth |
| `/api/oauth/microsoft` | GET | Microsoft OAuth initiation | Browser redirect |
| `/api/oauth/microsoft/callback` | GET | Microsoft OAuth callback | Microsoft OAuth |
| `/api/tracking/[token]` | GET | Email tracking pixel | Email clients |
| `/api/webhooks/gmail` | POST | Gmail push notifications | Google Pub/Sub |

### TEST_ONLY Routes (3 routes)

Routes only called from test files. Caller Type: `TEST_ONLY`, Call Style: `NONE` for production.

| Route | Methods | Test Evidence |
|-------|---------|---------------|
| `/api/email-drafts/[id]` | GET, PATCH | `tests/api/email-drafts-generate.test.ts:275`, `tests/ui/compose-page.test.tsx:33,60` |
| `/api/email-drafts/[id]/send` | POST | No test callers found, route uses services |
| `/api/email-drafts/generate` | POST | `tests/api/email-drafts-generate.test.ts:143,172,199,211` |

### UNKNOWN Routes (21 routes)

Routes with no detected callers. Caller Type: `UNKNOWN`, Call Style: `NONE`.

| Route | Methods | Services Used | Verification Command |
|-------|---------|---------------|---------------------|
| `/api/attachments/[id]` | GET, DELETE | attachment.service | `rg "\/api\/attachments\/" -n app components lib` |
| `/api/attachments/delete/[id]` | DELETE | attachment.service | `rg "\/api\/attachments\/delete" -n app components lib` |
| `/api/attachments/download/[id]` | GET | attachment.service | `rg "\/api\/attachments\/download" -n app components lib` |
| `/api/contacts/sync` | POST | email-connection, entity, group | `rg "\/api\/contacts\/sync" -n app components lib` |
| `/api/internal/ai-metrics/agreement` | GET | - | `rg "\/api\/internal" -n app components lib` |
| `/api/quests/[id]` | GET, PATCH | quest.service | `rg "\/api\/quests\/[^e]" -n app components lib` |
| `/api/quests/[id]/generate` | POST | quest.service | `rg "\/api\/quests\/.*\/generate" -n app components` |
| `/api/quests/context` | GET | quest-interpreter | `rg "\/api\/quests\/context" -n app components` |
| `/api/quests/interpret` | GET, POST | quest-interpreter | `rg "\/api\/quests\/interpret" -n app components` |
| `/api/quests/standing` | POST | quest.service | `rg "\/api\/quests\/standing" -n app components` |
| `/api/requests/detail` | GET | risk-computation | `rg "\/api\/requests\/detail[^/]" -n app components` |
| `/api/requests/detail/[id]/mark-read` | POST | - | `rg "mark-read" -n app components` |
| `/api/requests/detail/[id]/reminder-draft` | GET, POST | - | `rg "reminder-draft" -n app components` |
| `/api/requests/detail/[id]/risk` | PUT | - | `rg "\/risk[^-]" -n app components` |
| `/api/task-instances/[id]/attachments` | GET, POST | attachment.service | `rg "\/attachments[^/]" -n app components` |
| `/api/task-instances/[id]/labels/[labelId]` | GET, PATCH, DELETE | task-instance-label | `rg "\/labels\/[^r]" -n app components` |
| `/api/task-instances/[id]/request/dataset/preview` | GET, POST | task-instance | `rg "\/dataset\/preview" -n app components` |

---

## Section D: Orphan Triage

### Triage Categories for UNKNOWN Routes

| Category | Count | Description |
|----------|-------|-------------|
| Feature-flagged | 5 | Quest routes behind `QUEST_*` flags |
| Missing wiring | 6 | Valid functionality, needs UI integration |
| Recently wired | 6 | Wired in P1 Sprint 2026-01-21/22 |
| Duplicate/Legacy | 2 | Can be safely removed |
| Internal metrics | 1 | Not for frontend use |
| Unclear purpose | 1 | Needs investigation |

### Detailed Analysis

#### Feature-Flagged Routes (5)

These routes support Quest functionality behind feature flags:
- `/api/quests/[id]` - Quest detail/update
- `/api/quests/[id]/generate` - Generate quest email content
- `/api/quests/context` - Quest context for UI
- `/api/quests/interpret` - Natural language quest interpretation
- `/api/quests/standing` - Standing/recurring quests

**Flags**: `NEXT_PUBLIC_QUEST_UI`, `QUEST_AI_INTERPRETER`, `QUEST_STANDING`

#### Missing Wiring (6)

| Route | Sub-Workflow | Workflow Justification | Recommended Action |
|-------|--------------|----------------------|-------------------|
| `/api/requests/detail/[id]/reminder-draft` | WF-05c | Reminder preview | Wire to reminder preview modal |
| `/api/requests/detail/[id]/mark-read` | WF-05g | Read status tracking | Wire to request list row click |
| `/api/requests/detail/[id]/risk` | WF-05f | Manual risk override | Wire to request detail risk badge |
| `/api/task-instances/[id]/attachments` | WF-04e | File attachments on jobs | Wire to job detail attachments section |
| `/api/task-instances/[id]/labels/[labelId]` | WF-05a | Label management | Wire to label edit/delete UI |
| `/api/task-instances/[id]/request/dataset/preview` | WF-05b | Preview personalization | Wire to dataset preview step |

#### Recently Wired (6) - 2026-01-21/22

| Route | Sub-Workflow | Component | Evidence |
|-------|--------------|-----------|----------|
| `/api/recipients/search` | WF-07f | `send-request-modal.tsx:393` | Recipient autocomplete search |
| `/api/requests/detail/[id]/reminders` | WF-05e | `request-card-expandable.tsx:214,229` | Reminder info fetch + cancel |
| `/api/task-instances/[id]/collection/bulk` | WF-06c | `collection-tab.tsx:168` | Bulk approve/reject/delete actions |
| `/api/task-instances/[id]/collection/export` | WF-06d | `collection-tab.tsx:324` | Export All button |
| `/api/task-instances/[id]/table/signoff` | WF-03d | `data-tab.tsx:126,137` | Dataset signoff UI |
| `/api/task-lineages/[id]` | WF-10g | `data-tab-universal.tsx` | Indirectly via app-columns routes |

#### Duplicate/Legacy (2)

| Route | Issue | Recommendation |
|-------|-------|----------------|
| `/api/attachments/delete/[id]` | DELETE already exists on `/api/attachments/[id]` | Delete route file |
| `/api/requests/detail` | Base route without ID, unclear purpose | Investigate or delete |

#### Internal Metrics (1)

| Route | Purpose |
|-------|---------|
| `/api/internal/ai-metrics/agreement` | AI recommendation agreement metrics, admin use only |

---

## Section E: Top 10 Fix-Next Recommendations

Only items with workflow justification and verified no current frontend caller.

### Completed (2026-01-21)

| Route | Sub-Workflow | Status | Evidence |
|-------|--------------|--------|----------|
| `/api/recipients/search` | WF-07f | WIRED | `components/jobs/send-request-modal.tsx:393` |
| `/api/requests/detail/[id]/reminders` | WF-05e | WIRED | `components/jobs/request-card-expandable.tsx:214,229` |
| `/api/task-instances/[id]/collection/export` | WF-06d | WIRED | `components/jobs/collection/collection-tab.tsx:324` |
| `/api/task-instances/[id]/collection/bulk` | WF-06c | WIRED | `components/jobs/collection/collection-tab.tsx:168` |
| `/api/task-instances/[id]/table/signoff` | WF-03d | WIRED | `components/jobs/table/data-tab.tsx:126,137` |

### Remaining

| Priority | Route | Sub-Workflow | Workflow | Action |
|----------|-------|--------------|----------|--------|
| 1 | `/api/requests/detail/[id]/mark-read` | WF-05g | Mark Request Read/Unread | Wire to request row click handler |
| 2 | `/api/task-instances/[id]/labels/[labelId]` | WF-05a | Send Email Request (labels) | Wire to label edit/delete UI |
| 3 | `/api/requests/detail/[id]/reminder-draft` | WF-05c | Configure Request Reminders | Wire to reminder preview modal |
| 4 | `/api/requests/detail/[id]/risk` | WF-05f | Manually Override Request Risk | Wire to request detail risk badge |
| 5 | `/api/task-instances/[id]/attachments` | WF-04e | Manage Job Attachments | Wire to job detail attachments section |
| 6 | `/api/attachments/delete/[id]` | - | N/A - Duplicate | Delete route file |
| 7 | `/api/requests/detail` | - | N/A - Unclear purpose | Investigate or delete |

---

## Section F: Rules of the Road

### Date & Timezone Handling Contract

> **CRITICAL**: All date-only fields must be parsed without timezone conversion to prevent off-by-one day errors.

#### Date Field Categories

| Category | Fields | Storage Format | Frontend Parsing |
|----------|--------|----------------|------------------|
| **Date-only** | `dueDate`, `periodStart`, `periodEnd` | `YYYY-MM-DDT00:00:00.000Z` | Extract date part, create local Date |
| **Timestamp** | `createdAt`, `updatedAt`, `sentAt` | Full ISO timestamp | Standard `new Date()` OK |

#### Required Pattern for Date-Only Fields

```typescript
// WRONG - causes off-by-one errors due to UTC→local conversion
format(new Date(task.dueDate), "MMM d")  // Jan 31 UTC → Jan 30 in EST

// CORRECT - parse date part only
function parseDateOnly(dateStr: string): Date {
  const datePart = dateStr.split("T")[0]
  const [year, month, day] = datePart.split("-").map(Number)
  return new Date(year, month - 1, day)
}
format(parseDateOnly(task.dueDate), "MMM d")  // Correctly shows Jan 31
```

#### API Response Contract

All date-only fields returned from API routes MUST:
1. Be stored as midnight UTC in the database
2. Be returned as ISO strings (`YYYY-MM-DDT00:00:00.000Z`)
3. Be documented in this contract as date-only fields

#### Timezone Configuration

Organizations have a `timezone` field (e.g., `"America/New_York"`).

| Endpoint | Timezone Behavior |
|----------|-------------------|
| `GET /api/boards` | Returns `timezone` (nullable) and `timezoneConfigured` boolean |
| `GET /api/org/accounting-calendar` | Returns `timezone` setting |
| Board automation (Inngest) | Skips orgs without configured timezone |

#### Utility Location

Shared timezone utilities: `lib/utils/timezone.ts`

Key exports:
- `parseDateOnly()` - Parse date-only strings
- `formatDateInTimezone()` - Format with timezone
- `getTodayInTimezone()` - Get today's date in org timezone
- `getStartOfPeriod()` / `getEndOfPeriod()` - Period boundary calculations
- `generatePeriodBoardName()` - Timezone-aware board naming
- `formatPeriodDisplay()` - Format period ranges for display

---

### Classification Rules

1. **No caller claims without evidence**: Every Caller Type assertion must cite `file:line`
2. **UNKNOWN requires verification**: If no evidence found, provide exact `rg` command
3. **Route uses Service, not reverse**: Services provide business logic to routes, routes don't call services

### Adding New Routes

1. Create route in `app/api/`
2. Add frontend caller in same PR (or document why not needed)
3. Update this document with evidence
4. Run `npx tsx scripts/generate-api-map.ts` to verify detection

### Preventing UNKNOWN Routes

- Every new route must have at least one caller OR explicit classification:
  - `ADMIN` - admin-only functionality
  - `EXTERNAL` - external system callback
  - `SYSTEM` - Inngest/cron job
- UNKNOWN routes must be triaged within 2 weeks

---

## Section G: Drift Check Commands

### Regenerate Route Mapping

```bash
# Regenerate api-mapping.json and api-mapping.csv
npx tsx scripts/generate-api-map.ts

# Count by status
awk -F',' 'NR>1 {print $1}' api-mapping.csv | sort | uniq -c | sort -rn
```

### Find Frontend Callers

```bash
# All fetch calls
rg "fetch\(['\`\"]\/api\/" -n app components

# Specific route pattern
rg "\/api\/task-instances\/[^/]*\/collection" -n app components
```

### Verify UNKNOWN Route

```bash
# Full search for route
rg "route-path" -n app components lib inngest scripts tests
```

### Check for New UNKNOWN Routes

```bash
# Routes with 0 frontend callers from api-mapping.csv
awk -F',' '$1=="ORPHAN" {print $2}' api-mapping.csv
```

---

## Appendix: Quick Stats

| Metric | Count | Source |
|--------|-------|--------|
| Total API Routes | 130 | `find app/api -name "route.ts" \| wc -l` |
| FRONTEND | 83 | This document |
| ADMIN | 18 | Routes in `/api/admin/*` |
| EXTERNAL | 8 | OAuth, webhooks, tracking |
| TEST_ONLY | 3 | Only test file callers |
| UNKNOWN | 17 | No callers detected |
| Frontend Pages | 21 | `find app -name "page.tsx" \| wc -l` |

---

*Generated from codebase analysis. Regenerate mapping with `npx tsx scripts/generate-api-map.ts`*
