# Frontend-Backend Contract

> **Version**: 3.0 (Domain-Driven Model)
> **Last Updated**: 2026-02-19
> **Purpose**: Map all frontend pages and backend API routes to domains and workflows with evidence-based classifications.
> **Taxonomy Reference**: `docs/product/workflow-taxonomy.md`

---

## Table of Contents

- [Job Model (Simplified)](#job-model-simplified)
- [Draft Request Handling](#draft-request-handling-period-rollover)
- [Database Data Model & Import Contract](#database-data-model--import-contract)
- [Section A: Page-to-Domain Mapping](#section-a-page-to-domain-mapping)
- [Section B: Classification Model](#section-b-classification-model)
- [Section C: API Route Inventory by Domain](#section-c-api-route-inventory-by-domain)
- [Section D: Orphan Triage](#section-d-orphan-triage)
- [Section E: Fix-Next Recommendations](#section-e-fix-next-recommendations)
- [Section F: Rules of the Road](#section-f-rules-of-the-road)
- [Section G: Drift Check Commands](#section-g-drift-check-commands)

---

## Job Model (Simplified)

> **Updated February 2026**: Task types and stakeholder linking have been removed for a cleaner, more flexible model.

### Core Principle

**Jobs are simple containers. Features are selected at request time.**

A Job (TaskInstance) is a simple unit of work. There are no "types" of jobs - all jobs have access to the same features:
- Requests (email communication)
- Evidence collection
- Reports
- Forms

Recipients are selected when sending requests, not pre-assigned to jobs.

### Available Features

| Feature | Description | Domain | API Route Patterns | Workflows |
|---------|-------------|--------|-------------------|-----------|
| **Core** | Basic job operations | DOM-02 | `/api/task-instances/[id]`, `.../collaborators`, `.../comments` | WF-02.11–02.19 |
| **Request** | Email communication, reminders, tracking | DOM-03, DOM-04 | `/api/task-instances/[id]/request/*`, `/api/requests/*`, `/api/review/*` | WF-03.01–03.07, WF-04.01–04.08 |
| **Evidence** | File collection, review, export | DOM-02 | `/api/task-instances/[id]/collection/*` | WF-02.20 |
| **Report** | Attach report definitions to jobs | DOM-05 | `/api/reports/*`, `/api/generated-reports/*` | WF-05.06–05.10 |
| **Form** | Send form requests for data collection | DOM-03 | `/api/forms/*`, `/api/form-requests/*` | WF-03.08–03.12 |

### Removed Concepts

| Removed | Reason |
|---------|--------|
| `TaskType` enum | All jobs are now type-agnostic |
| `stakeholderScope` field | Stakeholders are not linked to tasks |
| `stakeholders` on jobs | Recipients selected at request time |
| Table/Variance feature | Removed (use Databases instead) |

### Developer Guardrails

```
CRITICAL: Job Stability Rules

1. Jobs are simple containers - do NOT add "type" concepts back.
2. Do NOT rename Job, Board, TaskInstance, or Organization.
3. Recipients are selected at request time, NOT pre-assigned to jobs.
4. Features are opt-in per request, not per job.
```

---

## Draft Request Handling (Period Rollover)

> **Last Updated**: 2026-01-22
> **Scope**: Recurring request drafts copied during board period rollover

### Overview

When a board completes and auto-creates the next period (WF-02.06 → WF-06.12), active requests from the previous period are copied forward as **draft requests** on the new job. These drafts require user review before sending.

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
3. **Recipients must be reviewed**: Recipients may need to change between periods
4. **Reminders require re-approval**: User must opt-in to reminders for each draft

### Related Workflows

- WF-02.06: Mark Board Complete (triggers draft copy)
- WF-06.12: System auto-creates next period board
- WF-03.04: Review & Send Draft Requests

---

## Database Data Model & Import Contract

> **Last Updated**: 2026-01-28
> **Scope**: Databases feature (DOM-05) - structured data storage with composite identifiers

### Data Model

```typescript
// Prisma Model
model Database {
  id              String   @id @default(cuid())
  name            String
  description     String?
  organizationId  String
  schema          Json     // DatabaseSchema
  identifierKeys  Json     // String[] - composite key columns
  rows            Json     // DatabaseRow[]
  rowCount        Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String
  lastImportedAt  DateTime?
  lastImportedById String?
}

// TypeScript Types
interface DatabaseSchema {
  columns: DatabaseSchemaColumn[]
  version: number
}

interface DatabaseSchemaColumn {
  key: string       // Internal identifier (no underscore prefix)
  label: string     // Display name
  dataType: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
  order: number
}

interface DatabaseRow {
  [key: string]: string | number | boolean | null
}
```

### Composite Identifiers

| Concept | Description |
|---------|-------------|
| `identifierKeys` | Array of column keys that together uniquely identify a row |
| Example | `["project_id", "period"]` - combination must be unique |
| Requirement | All identifier columns must be marked as `required: true` |

### Import Behavior (Append-Only)

**CRITICAL**: Import does NOT replace data. It appends new rows only.

| Scenario | Action |
|----------|--------|
| New composite key | Row is **added** |
| Existing composite key | Row is **rejected** (error) |
| Mix of new and duplicate | Entire import **fails** |

### Schema Edit Guardrails

| Operation | Allowed | Condition |
|-----------|---------|-----------|
| Add columns | Yes | Always |
| Rename labels | Yes | Always |
| Change column order | Yes | Always |
| Change data types | Warning | Existing data not converted |
| Mark required | Warning | Existing nulls may fail re-import |
| Remove columns | No | If data exists |
| Change identifiers | No | If data exists |
| Remove identifier column | No | Never |

### Limits

| Limit | Value |
|-------|-------|
| Max rows per database | 10,000 |
| Max columns per schema | 100 |

---

## Section A: Page-to-Domain Mapping

### DOM-01: Identity & Organization Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Landing | `/` | — | — |
| Terms | `/terms` | — | — |
| Privacy | `/privacy` | — | — |
| Sign Up | `/signup` | WF-01.01 | `/api/auth/signup` |
| Sign In | `/auth/signin` | WF-01.02 | NextAuth |
| Verify Email | `/auth/verify-email` | WF-01.01 | `/api/auth/verify` |
| Forgot Password | `/auth/forgot-password` | WF-01.03 | `/api/auth/forgot-password` |
| Reset Password | `/auth/reset-password` | WF-01.03 | `/api/auth/reset-password` |
| Accept Invite | `/auth/accept-invite` | WF-01.04 | `/api/auth/accept-invite` |
| Profile | `/dashboard/profile` | WF-01.05 | `/api/user/profile` |
| Settings (General) | `/dashboard/settings` | WF-01.09 | `/api/org/settings`, `/api/user/signature` |
| Settings / Team | `/dashboard/settings/team` | WF-01.07 | `/api/org/users/*`, `/api/email-accounts/*` |
| Settings / Role Permissions | `/dashboard/settings/role-permissions` | WF-01.08 | `/api/org/role-permissions` |

### DOM-02: Planning & Work Execution Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Dashboard (home) | `/dashboard` | — | `/api/task-instances`, `/api/boards` |
| Boards | `/dashboard/boards` | WF-02.01–02.10 | `/api/boards/*` |
| Jobs List | `/dashboard/jobs` | WF-02.03, WF-02.11–02.13 | `/api/task-instances`, `/api/boards/*` |
| Job Detail | `/dashboard/jobs/[id]` | WF-02.14–02.23, WF-03.01–03.04 | `/api/task-instances/[id]/*` |
| Collection | `/dashboard/collection` | WF-02.20 | `/api/collection`, `/api/boards` |
| Collection / Invoices | `/dashboard/collection/invoices` | WF-02.20 | `/api/boards` |
| Collection / Expenses | `/dashboard/collection/expenses` | WF-02.20 | `/api/boards` |
| Contacts | `/dashboard/contacts` | WF-02.21 | `/api/entities/*`, `/api/groups/*` |
| Campaigns | `/dashboard/campaigns` | — | — |

### DOM-03: Outreach & Data Collection Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Forms List | `/dashboard/forms` | WF-03.08 | `/api/forms` |
| Form Builder | `/dashboard/forms/[id]` | WF-03.08, WF-03.12 | `/api/forms/[id]`, `/api/forms/[id]/viewers` |
| New Form | `/dashboard/forms/new` | WF-03.08 | `/api/forms` |
| Form Submission (public) | `/forms/[requestId]` | WF-03.10 | `/api/form-requests/token/[token]`, `.../submit` |

### DOM-04: Inbound Review & Resolution Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Inbox | `/dashboard/inbox` | WF-04.01 | `/api/inbox` |
| Requests List | `/dashboard/requests` | WF-04.02–04.05 | `/api/requests/detail/*` |
| Request Detail | `/dashboard/requests/[key]` | WF-04.02–04.08 | `/api/requests/detail/[id]/*` |
| Reply Review | `/dashboard/review/[messageId]` | WF-04.06–04.07 | `/api/review/*` |

### DOM-05: Data Intelligence Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Databases List | `/dashboard/databases` | WF-05.01, WF-05.05 | `/api/databases` |
| Database Detail | `/dashboard/databases/[id]` | WF-05.02–05.04 | `/api/databases/[id]/*` |
| New Database | `/dashboard/databases/new` | WF-05.01 | `/api/databases` |
| Reports List | `/dashboard/reports` | WF-05.06, WF-05.08–05.10 | `/api/reports`, `/api/generated-reports` |
| Report Detail | `/dashboard/reports/[id]` | WF-05.07 | `/api/reports/[id]/*` |
| New Report | `/dashboard/reports/new` | WF-05.06 | `/api/reports` |
| Reconciliations List | `/dashboard/reconciliations` | WF-05.11 | `/api/reconciliations` |
| New Reconciliation | `/dashboard/reconciliations/new` | WF-05.11 | `/api/reconciliations` |
| Reconciliation Detail | `/dashboard/reconciliations/[configId]` | WF-05.12–05.13 | `/api/reconciliations/[configId]/*` |
| Analysis | `/dashboard/analysis` | WF-05.14 | `/api/analysis/conversations` |
| Analysis Chat | `/dashboard/analysis/chat/[id]` | WF-05.14 | `/api/analysis/conversations/[id]/messages` |

### DOM-06: Automation & Agents Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Agents List | `/dashboard/agents` | WF-06.01 | `/api/agents` |
| Agent Detail | `/dashboard/agents/[id]` | WF-06.01–06.06 | `/api/agents/[agentId]/*` |
| Automations List | `/dashboard/automations` | WF-06.07, WF-06.09 | `/api/automation-rules`, `/api/workflow-runs` |
| New Automation | `/dashboard/automations/new` | WF-06.07 | `/api/automation-rules` |
| Automation Detail | `/dashboard/automations/[id]` | WF-06.07–06.08 | `/api/automation-rules/[id]/*` |
| Workflow Run Detail | `/dashboard/automations/[id]/runs/[runId]` | WF-06.09 | `/api/workflow-runs/[id]` |

### DOM-07: Integrations & Delivery Channels Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Settings / Integrations | `/dashboard/settings/integrations` | WF-07.01–07.03 | `/api/oauth/*`, `/api/email-accounts` |
| Settings / Accounting | `/dashboard/settings/accounting` | WF-07.04 | `/api/integrations/accounting/*`, `/api/org/accounting-calendar` |

### DOM-08: Platform Ops & Internal Pages

| Page | URL | Workflows | Key APIs |
|------|-----|-----------|----------|
| Admin Dashboard | `admin-dashboard/` | WF-08.01–08.04 | Separate app |
| Admin Login | `admin-dashboard/login` | — | Separate auth |
| Admin Errors | `admin-dashboard/errors` | WF-08.04 | — |
| Admin Activity | `admin-dashboard/activity` | WF-08.01 | — |
| Admin Companies | `admin-dashboard/companies` | WF-08.01 | — |
| Admin Company Detail | `admin-dashboard/companies/[id]` | WF-08.01 | — |

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

## Section C: API Route Inventory by Domain

### DOM-01: Identity & Organization (18 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/auth/[...nextauth]` | ALL | WF-01.02 | EXTERNAL | NextAuth.js framework |
| `/api/auth/signup` | POST | WF-01.01 | FRONTEND | `app/signup/page.tsx:48` |
| `/api/auth/verify` | GET | WF-01.01 | FRONTEND | `app/auth/verify-email/page.tsx:27` |
| `/api/auth/accept-invite` | GET, POST | WF-01.04 | FRONTEND | `app/auth/accept-invite/page.tsx:42,84` |
| `/api/auth/forgot-password` | POST | WF-01.03 | FRONTEND | `app/auth/forgot-password/page.tsx:20` |
| `/api/auth/reset-password` | GET, POST | WF-01.03 | FRONTEND | `app/auth/reset-password/page.tsx:33,69` |
| `/api/user/profile` | GET, PATCH | WF-01.05 | FRONTEND | `app/dashboard/profile/page.tsx` |
| `/api/user/signature` | GET, PUT | WF-01.05 | FRONTEND | `app/dashboard/settings/page.tsx:68,84` |
| `/api/user/onboarding` | GET, POST | WF-01.06 | FRONTEND | `components/onboarding-checklist.tsx:91,109` |
| `/api/users` | GET | WF-01.07 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:571` |
| `/api/org/settings` | GET, PUT | WF-01.09 | FRONTEND | `app/dashboard/settings/page.tsx:28,44` |
| `/api/org/team` | GET | WF-01.07 | FRONTEND | `app/dashboard/jobs/page.tsx:211` |
| `/api/org/users` | GET, POST | WF-01.07 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:571` |
| `/api/org/users/[id]` | GET, PATCH, DELETE | WF-01.07 | FRONTEND | `app/dashboard/settings/team/page.tsx:275,313` |
| `/api/org/accounting-calendar` | GET, PUT | WF-01.09 | FRONTEND | `app/dashboard/settings/accounting/page.tsx:44,61` |
| `/api/org/role-permissions` | GET, PUT | WF-01.08 | FRONTEND | `app/dashboard/settings/role-permissions/page.tsx` |
| `/api/contacts/type-counts` | GET | WF-01.09 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:523` |
| `/api/contacts/custom-types` | POST, DELETE | WF-01.09 | FRONTEND | `components/contacts/bulk-action-toolbar.tsx:97` |

### DOM-02: Planning & Work Execution (46 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/boards` | GET, POST | WF-02.01, WF-02.03 | FRONTEND | `app/dashboard/boards/page.tsx:255,452` |
| `/api/boards/[id]` | GET, PATCH, DELETE | WF-02.02–02.08 | FRONTEND | `app/dashboard/boards/page.tsx:273,400,416,438,474` |
| `/api/boards/[id]/ai-summary` | GET | WF-02.10 | FRONTEND | `app/dashboard/boards/page.tsx` |
| `/api/boards/[id]/close-summary` | GET | WF-02.09 | FRONTEND | `app/dashboard/boards/page.tsx` |
| `/api/boards/column-config` | GET, PATCH | WF-02.03 | FRONTEND | `app/dashboard/boards/page.tsx` |
| `/api/boards/team-members` | GET | WF-02.04 | FRONTEND | `components/boards/create-board-modal.tsx:175` |
| `/api/task-instances` | GET, POST | WF-02.03, WF-02.11 | FRONTEND | `app/dashboard/jobs/page.tsx:179,376,443,505` |
| `/api/task-instances/[id]` | GET, PATCH, DELETE | WF-02.12–02.19 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:357,639,668` |
| `/api/task-instances/[id]/ai-summary` | POST | WF-02.23 | FRONTEND | `components/jobs/task-ai-summary.tsx:67` |
| `/api/task-instances/[id]/config` | GET | WF-02.19 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx` |
| `/api/task-instances/[id]/timeline` | GET | WF-02.18 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:445` |
| `/api/task-instances/[id]/previous-period` | GET | WF-02.03 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx` |
| `/api/task-instances/[id]/collaborators` | GET, POST, DELETE | WF-02.14 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:559,817,836` |
| `/api/task-instances/[id]/comments` | GET, POST, DELETE | WF-02.18 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:421,755` |
| `/api/task-instances/[id]/attachments` | GET, POST | WF-02.17 | UNKNOWN | `rg "\/attachments[^/]" -n app components` |
| `/api/task-instances/[id]/labels` | GET, POST | WF-02.21 | FRONTEND | `components/jobs/send-request-modal.tsx:246` |
| `/api/task-instances/[id]/labels/[labelId]` | GET, PATCH, DELETE | WF-02.21 | UNKNOWN | `rg "\/labels\/" -n app components` |
| `/api/task-instances/[id]/contact-labels` | GET, POST, PATCH, DELETE | WF-02.21 | FRONTEND | `components/jobs/contact-labels-table.tsx:28` |
| `/api/task-instances/[id]/collection` | GET, POST | WF-02.20 | FRONTEND | `components/jobs/collection/collection-upload-modal.tsx:96` |
| `/api/task-instances/[id]/collection/[itemId]` | GET, PATCH, DELETE | WF-02.20 | FRONTEND | `components/jobs/collection/collection-tab.tsx:189` |
| `/api/task-instances/[id]/collection/bulk` | POST | WF-02.20 | FRONTEND | `components/jobs/collection/collection-tab.tsx:168` |
| `/api/task-instances/[id]/collection/download` | GET | WF-02.20 | FRONTEND | `components/jobs/collection/collection-tab.tsx:166` |
| `/api/task-instances/[id]/collection/export` | GET | WF-02.20 | FRONTEND | `components/jobs/collection/collection-tab.tsx:324` |
| `/api/task-instances/[id]/requests` | GET, POST, DELETE | WF-03.04 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:407`, `components/jobs/draft-request-review-modal.tsx:122,154,181` |
| `/api/task-instances/[id]/form-requests` | GET, POST | WF-03.09 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx` |
| `/api/task-instances/ai-generate` | POST | WF-02.22 | FRONTEND | `components/jobs/ai-bulk-upload-modal.tsx:79` |
| `/api/task-instances/ai-summary` | POST | WF-02.23 | FRONTEND | `components/jobs/ai-summary-panel.tsx:41` |
| `/api/task-instances/bulk-import` | POST | WF-02.22 | FRONTEND | `components/jobs/ai-bulk-upload-modal.tsx:217` |
| `/api/task-instances/column-config` | GET, PATCH | WF-02.03 | FRONTEND | `components/jobs/configurable-table/configurable-table.tsx:186,209` |
| `/api/task-instances/lineages` | GET | WF-02.03 | FRONTEND | `app/dashboard/jobs/page.tsx` |
| `/api/task-instances/template` | GET | WF-02.22 | FRONTEND | `components/jobs/ai-bulk-upload-modal.tsx:310` |
| `/api/task-lineages/[id]` | GET, PATCH, DELETE | WF-02.11 | FRONTEND | `app/dashboard/jobs/page.tsx` |
| `/api/collection` | GET, PATCH | WF-02.20 | FRONTEND | `app/dashboard/collection/page.tsx:159` |
| `/api/collection/preview/[id]` | GET | WF-02.20 | FRONTEND | `components/jobs/collection/collection-tab.tsx:478` |
| `/api/collection/download/[id]` | GET | WF-02.20 | FRONTEND | `app/dashboard/collection/page.tsx` |
| `/api/attachments/[id]` | GET, DELETE | WF-02.17 | UNKNOWN | `rg "\/api\/attachments\/" -n app components lib` |
| `/api/attachments/by-key/[key]` | GET | WF-02.17 | UNKNOWN | Same as above |
| `/api/attachments/download/[id]` | GET | WF-02.17 | UNKNOWN | Same as above |
| `/api/entities` | GET, POST | WF-02.21 | FRONTEND | `app/dashboard/contacts/page.tsx:59` |
| `/api/entities/[id]` | GET, PATCH, DELETE | WF-02.21 | FRONTEND | `components/contacts/contact-list.tsx:72` |
| `/api/entities/bulk` | POST | WF-02.21 | FRONTEND | `components/contacts/csv-upload.tsx:64` |
| `/api/entities/bulk-update` | POST | WF-02.21 | FRONTEND | `components/contacts/bulk-action-toolbar.tsx:134` |
| `/api/entities/import` | POST | WF-02.21 | FRONTEND | `components/contacts/import-modal.tsx:124` |
| `/api/groups` | GET, POST | WF-02.21 | FRONTEND | `app/dashboard/contacts/page.tsx:74` |
| `/api/groups/[id]` | GET, PATCH, DELETE | WF-02.21 | FRONTEND | `components/contacts/groups-manager.tsx:63,91` |
| `/api/templates/contacts` | GET | WF-02.21 | FRONTEND | `components/contacts/import-modal.tsx:156` |

### DOM-03: Outreach & Data Collection (34 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/task-instances/[id]/request/draft` | POST | WF-03.01 | FRONTEND | `components/jobs/send-request-modal.tsx:291` |
| `/api/task-instances/[id]/request/refine` | POST | WF-03.01 | FRONTEND | `components/jobs/send-request-modal.tsx:434` |
| `/api/task-instances/[id]/request/reminder-preview` | POST | WF-03.03 | FRONTEND | `components/jobs/send-request-modal.tsx:397` |
| `/api/task-instances/[id]/request/dataset` | GET, PATCH | WF-03.02 | FRONTEND | `components/jobs/data-personalization/compose-send-step.tsx:283,326` |
| `/api/task-instances/[id]/request/dataset/preview` | GET, POST | WF-03.02 | UNKNOWN | `rg "\/dataset\/preview" -n app components` |
| `/api/task-instances/[id]/request/dataset/send` | POST | WF-03.02 | FRONTEND | `components/jobs/data-personalization/compose-send-step.tsx:366` |
| `/api/task-instances/[id]/request/dataset/upload` | POST | WF-03.02 | FRONTEND | `components/jobs/data-personalization/upload-step.tsx:204` |
| `/api/task-instances/[id]/request/database/draft` | POST | WF-03.02 | FRONTEND | `components/jobs/send-request-modal.tsx` |
| `/api/task-instances/[id]/request/database/send` | POST | WF-03.02 | FRONTEND | `components/jobs/send-request-modal.tsx` |
| `/api/quests` | GET, POST | WF-03.07 | FRONTEND | `components/jobs/send-request-modal.tsx:533` |
| `/api/quests/[id]` | GET, PATCH | WF-03.07 | UNKNOWN | `rg "\/api\/quests\/[^e]" -n app components lib` |
| `/api/quests/[id]/execute` | POST | WF-03.07 | FRONTEND | `components/jobs/send-request-modal.tsx:562` |
| `/api/quests/[id]/generate` | POST | WF-03.07 | UNKNOWN | `rg "\/api\/quests\/.*\/generate" -n app components` |
| `/api/quests/context` | GET | WF-03.07 | UNKNOWN | `rg "\/api\/quests\/context" -n app components` |
| `/api/quests/interpret` | GET, POST | WF-03.07 | UNKNOWN | `rg "\/api\/quests\/interpret" -n app components` |
| `/api/quests/standing` | POST | WF-03.07 | UNKNOWN | `rg "\/api\/quests\/standing" -n app components` |
| `/api/email-drafts/[id]` | GET, PATCH | WF-03.01 | TEST_ONLY | `tests/api/email-drafts-generate.test.ts:275` |
| `/api/email-drafts/[id]/send` | POST | WF-03.01 | TEST_ONLY | No production callers |
| `/api/email-drafts/csv-upload` | POST | WF-03.02 | TEST_ONLY | No production callers |
| `/api/email-drafts/generate` | POST | WF-03.01 | TEST_ONLY | `tests/api/email-drafts-generate.test.ts:143,172,199,211` |
| `/api/request-templates` | GET, POST | WF-03.05 | FRONTEND | `components/jobs/send-request-modal.tsx` |
| `/api/request-templates/[id]` | GET, PATCH, DELETE | WF-03.05 | FRONTEND | `components/jobs/send-request-modal.tsx` |
| `/api/recipients/search` | GET | WF-03.06 | FRONTEND | `components/jobs/send-request-modal.tsx:393` |
| `/api/recipients/all` | GET | WF-03.06 | FRONTEND | `components/jobs/send-request-modal.tsx` |
| `/api/forms` | GET, POST | WF-03.08 | FRONTEND | `app/dashboard/forms/page.tsx` |
| `/api/forms/[id]` | GET, PATCH, DELETE | WF-03.08 | FRONTEND | `app/dashboard/forms/[id]/page.tsx` |
| `/api/forms/[id]/viewers` | GET, PUT | WF-03.12 | FRONTEND | `app/dashboard/forms/[id]/page.tsx` |
| `/api/form-requests/[id]/request` | GET | WF-03.09 | FRONTEND | `app/forms/[requestId]/page.tsx` |
| `/api/form-requests/[id]/submit` | POST | WF-03.10 | FRONTEND | `app/forms/[requestId]/page.tsx` |
| `/api/form-requests/[id]/attachments` | GET, POST, DELETE | WF-03.10 | FRONTEND | `app/forms/[requestId]/page.tsx` |
| `/api/form-requests/[id]/remind` | POST | WF-03.11 | FRONTEND | `app/dashboard/forms/[id]/page.tsx` |
| `/api/form-requests/tasks` | GET | WF-03.09 | FRONTEND | `app/dashboard/forms/page.tsx` |
| `/api/form-requests/token/[token]` | GET, POST | WF-03.10 | EXTERNAL | Public form fill via token URL |

### DOM-04: Inbound Review & Resolution (17 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/inbox` | GET | WF-04.01 | FRONTEND | `app/dashboard/inbox/page.tsx` |
| `/api/inbox/count` | GET | WF-04.01 | FRONTEND | `components/dashboard-shell.tsx` |
| `/api/requests` | GET | WF-04.02 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx:392` |
| `/api/requests/detail` | GET | WF-04.02 | UNKNOWN | Candidate for deletion — `/detail/[id]` is the actual endpoint |
| `/api/requests/detail/[id]` | GET, PATCH | WF-04.02–04.03 | FRONTEND | `app/dashboard/requests/page.tsx:148` |
| `/api/requests/detail/[id]/messages` | GET | WF-04.02 | FRONTEND | `app/dashboard/requests/page.tsx:331,385` |
| `/api/requests/detail/[id]/mark-read` | POST | WF-04.04 | UNKNOWN | `rg "mark-read" -n app components` |
| `/api/requests/detail/[id]/reminders` | GET, DELETE | WF-04.02 | FRONTEND | `components/jobs/request-card-expandable.tsx:214,229` |
| `/api/requests/detail/[id]/reminder-draft` | GET, POST | WF-04.02 | UNKNOWN | `rg "reminder-draft" -n app components` |
| `/api/requests/detail/[id]/reply` | POST | WF-04.07 | FRONTEND | `components/reply-review/right-pane/reply-section.tsx:73` |
| `/api/requests/detail/[id]/reply-draft` | POST | WF-04.07 | FRONTEND | `components/reply-review/right-pane/reply-section.tsx:44` |
| `/api/requests/detail/[id]/retry` | POST | WF-04.03 | FRONTEND | `app/dashboard/requests/page.tsx` |
| `/api/requests/detail/[id]/risk` | PUT | WF-04.05 | UNKNOWN | `rg "\/risk[^-]" -n app components` |
| `/api/requests/[id]/accept-suggestion` | POST | WF-04.08 | FRONTEND | `app/dashboard/requests/page.tsx` |
| `/api/review/[messageId]` | GET, PATCH | WF-04.06 | FRONTEND | `components/reply-review/reply-review-layout.tsx:87` |
| `/api/review/analyze` | POST | WF-04.06 | FRONTEND | `components/reply-review/right-pane/ai-summary-section.tsx:38` |
| `/api/review/draft-reply` | POST | WF-04.07 | FRONTEND | `components/reply-review/right-pane/review-rhs.tsx:120` |

### DOM-05: Data Intelligence (40 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/databases` | GET, POST | WF-05.01 | FRONTEND | `app/dashboard/databases/page.tsx:42,98` |
| `/api/databases/[id]` | GET, PATCH, DELETE | WF-05.01, WF-05.05 | FRONTEND | `app/dashboard/databases/[id]/page.tsx:67` |
| `/api/databases/[id]/columns` | GET | WF-05.02 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` |
| `/api/databases/[id]/rows` | DELETE | WF-05.01 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` |
| `/api/databases/[id]/schema` | PATCH | WF-05.02 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` |
| `/api/databases/[id]/sync` | POST | WF-05.03 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` |
| `/api/databases/[id]/template.xlsx` | GET | WF-05.04 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` (window.open) |
| `/api/databases/[id]/export.xlsx` | GET | WF-05.04 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` (window.open) |
| `/api/databases/[id]/import` | POST | WF-05.03 | FRONTEND | `app/dashboard/databases/[id]/page.tsx:218` |
| `/api/databases/[id]/import/preview` | POST | WF-05.03 | FRONTEND | `app/dashboard/databases/[id]/page.tsx:195` |
| `/api/databases/[id]/viewers` | GET, PUT | WF-05.01 | FRONTEND | `app/dashboard/databases/[id]/page.tsx` |
| `/api/reports` | GET, POST | WF-05.06 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/reports/[id]` | GET, PATCH, DELETE | WF-05.07 | FRONTEND | `app/dashboard/reports/[id]/page.tsx` |
| `/api/reports/[id]/preview` | GET, POST | WF-05.07 | FRONTEND | `app/dashboard/reports/[id]/page.tsx` |
| `/api/reports/[id]/filter-properties` | GET | WF-05.07 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/reports/[id]/insights` | POST | WF-05.10 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/reports/[id]/viewers` | GET, PUT | WF-05.06 | FRONTEND | `app/dashboard/reports/[id]/page.tsx` |
| `/api/reports/[id]/duplicate` | POST | WF-05.06 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/generated-reports` | GET, POST | WF-05.08 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/generated-reports/[id]` | GET | WF-05.08 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/generated-reports/[id]/export` | GET | WF-05.09 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/generated-reports/[id]/insights` | GET, POST | WF-05.10 | FRONTEND | `app/dashboard/reports/page.tsx` |
| `/api/generated-reports/ensure-for-task` | POST | WF-05.08 | FRONTEND | `app/dashboard/jobs/[id]/page.tsx` |
| `/api/reconciliations` | GET, POST | WF-05.11 | FRONTEND | `app/dashboard/reconciliations/page.tsx` |
| `/api/reconciliations/completed` | GET | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/page.tsx` |
| `/api/reconciliations/analyze` | POST | WF-05.13 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/suggest-mappings` | POST | WF-05.13 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]` | GET, PATCH, DELETE | WF-05.11 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/viewers` | GET, PUT | WF-05.11 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs` | GET, POST | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]` | GET | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]/upload` | POST | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]/load-database` | POST | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]/match` | POST | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]/accept-match` | POST | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]/exceptions` | PATCH | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/reconciliations/[configId]/runs/[runId]/complete` | POST | WF-05.12 | FRONTEND | `app/dashboard/reconciliations/[configId]/page.tsx` |
| `/api/analysis/conversations` | GET, POST | WF-05.14 | FRONTEND | `app/dashboard/analysis/page.tsx` |
| `/api/analysis/conversations/[id]` | GET, DELETE | WF-05.14 | FRONTEND | `app/dashboard/analysis/chat/[id]/page.tsx` |
| `/api/analysis/conversations/[id]/messages` | POST | WF-05.14 | FRONTEND | `app/dashboard/analysis/chat/[id]/page.tsx` |

### DOM-06: Automation & Agents (16 routes + 13 Inngest functions)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/agents` | GET, POST | WF-06.01 | FRONTEND | `app/dashboard/agents/page.tsx` |
| `/api/agents/[agentId]` | GET, PATCH, DELETE | WF-06.01 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/execute` | POST | WF-06.02 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/executions` | GET | WF-06.03 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/executions/[executionId]` | GET, POST | WF-06.03 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/executions/[executionId]/status` | GET | WF-06.03 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` (polling) |
| `/api/agents/[agentId]/executions/[executionId]/cancel` | POST | WF-06.04 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/executions/[executionId]/feedback` | POST | WF-06.06 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/memory` | GET | WF-06.05 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/agents/[agentId]/metrics` | GET | WF-06.05 | FRONTEND | `app/dashboard/agents/[id]/page.tsx` |
| `/api/automation-rules` | GET, POST | WF-06.07 | FRONTEND | `app/dashboard/automations/page.tsx` |
| `/api/automation-rules/[id]` | GET, PATCH, DELETE | WF-06.07 | FRONTEND | `app/dashboard/automations/[id]/page.tsx` |
| `/api/automation-rules/[id]/run` | POST | WF-06.08 | FRONTEND | `app/dashboard/automations/[id]/page.tsx` |
| `/api/workflow-runs` | GET | WF-06.09 | FRONTEND | `app/dashboard/automations/page.tsx` |
| `/api/workflow-runs/[id]` | GET | WF-06.09 | FRONTEND | `app/dashboard/automations/[id]/runs/[runId]/page.tsx` |
| `/api/workflow-runs/[id]/approve` | POST | WF-06.09 | FRONTEND | `app/dashboard/automations/[id]/runs/[runId]/page.tsx` |

**Inngest Functions** (all DOM-06, Caller: SYSTEM):

| Function | Trigger | Schedule | Workflow |
|----------|---------|----------|----------|
| `ping` | Event | — | WF-06.12 |
| `classify-message` | Event: `message/classify` | — | WF-06.11 |
| `summarize-task` | Event: `task/summarize` | — | WF-06.11 |
| `sync-gmail-accounts` | Cron | Every 1 min | WF-06.10 |
| `sync-microsoft-accounts` | Cron | Every 1 min | WF-06.10 |
| `reminder/send-due` | Cron | Every 15 min | WF-06.12 |
| `quest/execute-standing` | Cron | Every 5 min | WF-06.12 |
| `process-email-queue` | Cron | Every hour | WF-06.12 |
| `auto-create-period-boards` | Cron | Every hour | WF-06.12 |
| `workflow-run` | Event: `workflow/run` | — | WF-06.12 |
| `workflow-trigger-dispatcher` | Event: `workflow/trigger` | — | WF-06.12 |
| `workflow-scheduler` | Cron | Every 5 min | WF-06.12 |
| `agent-run` | Event: `agent/run` | — | WF-06.02 |

### DOM-07: Integrations & Delivery Channels (16 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/oauth/gmail` | GET | WF-07.01 | EXTERNAL | Browser redirect to Google |
| `/api/oauth/gmail/callback` | GET | WF-07.01 | EXTERNAL | Google OAuth callback |
| `/api/oauth/microsoft` | GET | WF-07.02 | EXTERNAL | Browser redirect to Microsoft |
| `/api/oauth/microsoft/callback` | GET | WF-07.02 | EXTERNAL | Microsoft OAuth callback |
| `/api/email-accounts` | GET | WF-07.03 | FRONTEND | `components/jobs/send-request-modal.tsx:217` |
| `/api/email-accounts/[id]` | DELETE | WF-07.03 | FRONTEND | `app/dashboard/settings/team/page.tsx:204` |
| `/api/integrations/accounting/link-token` | POST | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/connect` | POST | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/disconnect` | DELETE | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/status` | GET | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/sync` | POST | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/config` | PUT | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/sources` | GET | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/integrations/accounting/preview` | POST | WF-07.04 | FRONTEND | `app/dashboard/settings/accounting/page.tsx` |
| `/api/webhooks/gmail` | POST | WF-07.05 | EXTERNAL | Google Pub/Sub |
| `/api/tracking/[token]` | GET | WF-07.05 | EXTERNAL | Email clients (pixel) |

### DOM-08: Platform Ops & Internal (24 routes)

| Route | Methods | Workflow(s) | Caller | Evidence |
|-------|---------|-------------|--------|----------|
| `/api/admin/backfill-completion` | POST | WF-08.02 | ADMIN | — |
| `/api/admin/backfill-file-urls` | GET | WF-08.02 | ADMIN | — |
| `/api/admin/backfill-risk` | POST | WF-08.02 | ADMIN | — |
| `/api/admin/check-replies` | GET | WF-08.04 | ADMIN | — |
| `/api/admin/cleanup-requests` | POST | WF-08.03 | ADMIN | — |
| `/api/admin/debug-accounts` | GET, POST | WF-08.01 | ADMIN | — |
| `/api/admin/debug-blob` | GET | WF-08.01 | ADMIN | — |
| `/api/admin/debug-collection` | GET | WF-08.01 | ADMIN | — |
| `/api/admin/debug-email-sync` | GET | WF-08.01 | ADMIN | — |
| `/api/admin/debug-messages` | GET, POST | WF-08.01 | ADMIN | — |
| `/api/admin/debug/[taskId]` | GET | WF-08.01 | ADMIN | — |
| `/api/admin/delete-user` | DELETE | WF-08.03 | ADMIN | — |
| `/api/admin/health-check` | GET | WF-08.04 | ADMIN | — |
| `/api/admin/migrate` | POST | WF-08.02 | ADMIN | — |
| `/api/admin/pipeline-status` | GET | WF-08.04 | ADMIN | — |
| `/api/admin/reminders/run-once` | POST | WF-08.03 | ADMIN | — |
| `/api/admin/sync-emails` | POST | WF-08.03 | ADMIN | — |
| `/api/admin/sync-gmail-now` | POST | WF-08.03 | ADMIN | — |
| `/api/inngest` | GET, POST, PUT | WF-06.12 | EXTERNAL | Inngest Cloud |
| `/api/errors/report` | POST | WF-08.04 | FRONTEND | `app/layout.tsx:33` (global error handler) |
| `/api/internal/ai-metrics/agreement` | GET | WF-08.04 | INTERNAL | Admin analytics only |
| `/api/notifications` | GET, PATCH | WF-08.05 | FRONTEND | `components/notifications/notification-bell.tsx` |
| `/api/notifications/[id]` | PATCH | WF-08.05 | FRONTEND | `components/notifications/notification-bell.tsx` |
| `/api/notifications/count` | GET | WF-08.05 | FRONTEND | `components/notifications/notification-bell.tsx` |

---

## Section D: Orphan Triage

### UNKNOWN Routes (11)

| Route | Domain | Workflow | Recommendation |
|-------|--------|---------|----------------|
| `/api/attachments/[id]` | DOM-02 | WF-02.17 | Wire to job detail attachments section |
| `/api/attachments/by-key/[key]` | DOM-02 | WF-02.17 | Wire to attachment preview |
| `/api/attachments/download/[id]` | DOM-02 | WF-02.17 | Wire to attachment download |
| `/api/requests/detail` (base) | DOM-04 | WF-04.02 | Delete — `/detail/[id]` is the actual endpoint |
| `/api/requests/detail/[id]/mark-read` | DOM-04 | WF-04.04 | Wire to request row click handler |
| `/api/requests/detail/[id]/reminder-draft` | DOM-04 | WF-04.02 | Wire to reminder preview modal |
| `/api/requests/detail/[id]/risk` | DOM-04 | WF-04.05 | Wire to request detail risk badge |
| `/api/task-instances/[id]/attachments` | DOM-02 | WF-02.17 | Wire to job detail attachments section |
| `/api/task-instances/[id]/labels/[labelId]` | DOM-02 | WF-02.21 | Wire to label edit/delete UI |
| `/api/quests/[id]` | DOM-03 | WF-03.07 | Quest routes — verify feature flag status |
| `/api/quests/context` | DOM-03 | WF-03.07 | Same as above |

### TEST_ONLY Routes (4)

| Route | Domain | Notes |
|-------|--------|-------|
| `/api/email-drafts/[id]` | DOM-03 | Legacy email draft CRUD |
| `/api/email-drafts/[id]/send` | DOM-03 | Legacy email draft send |
| `/api/email-drafts/csv-upload` | DOM-03 | Legacy CSV upload |
| `/api/email-drafts/generate` | DOM-03 | Legacy draft generation |

---

## Section E: Fix-Next Recommendations

| Priority | Route | Domain | Workflow | Action |
|----------|-------|--------|----------|--------|
| 1 | `/api/requests/detail/[id]/mark-read` | DOM-04 | WF-04.04 | Wire to request row click handler |
| 2 | `/api/task-instances/[id]/attachments` | DOM-02 | WF-02.17 | Wire to job detail attachments section |
| 3 | `/api/task-instances/[id]/labels/[labelId]` | DOM-02 | WF-02.21 | Wire to label edit/delete UI |
| 4 | `/api/requests/detail/[id]/reminder-draft` | DOM-04 | WF-04.02 | Wire to reminder preview modal |
| 5 | `/api/requests/detail/[id]/risk` | DOM-04 | WF-04.05 | Wire to request detail risk badge |
| 6 | `/api/requests/detail` (base) | DOM-04 | — | Delete route file |

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
// WRONG - causes off-by-one errors due to UTC->local conversion
format(new Date(task.dueDate), "MMM d")  // Jan 31 UTC -> Jan 30 in EST

// CORRECT - parse date part only
function parseDateOnly(dateStr: string): Date {
  const datePart = dateStr.split("T")[0]
  const [year, month, day] = datePart.split("-").map(Number)
  return new Date(year, month - 1, day)
}
format(parseDateOnly(task.dueDate), "MMM d")  // Correctly shows Jan 31
```

#### Timezone Configuration

Organizations have a `timezone` field (e.g., `"America/New_York"`).

| Endpoint | Timezone Behavior |
|----------|-------------------|
| `GET /api/boards` | Returns `timezone` (nullable) and `timezoneConfigured` boolean |
| `GET /api/org/accounting-calendar` | Returns `timezone` setting |
| Board automation (Inngest) | Skips orgs without configured timezone |

#### Utility Location

Shared timezone utilities: `lib/utils/timezone.ts`

### Classification Rules

1. **No caller claims without evidence**: Every Caller Type assertion must cite `file:line`
2. **UNKNOWN requires verification**: If no evidence found, provide exact `rg` command
3. **Route uses Service, not reverse**: Services provide business logic to routes, routes don't call services

### Adding New Routes

1. Create route in `app/api/`
2. Add frontend caller in same PR (or document why not needed)
3. Assign to a domain in `workflow-taxonomy.md`
4. Update this document with evidence
5. Run `npx tsx scripts/generate-api-map.ts` to verify detection

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
# Count route files
find app/api -name "route.ts" | wc -l

# Regenerate api-mapping (if script exists)
npx tsx scripts/generate-api-map.ts
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

### Domain Assignment Verification

```bash
# Count routes per domain by checking taxonomy doc
grep "DOM-0" docs/product/workflow-taxonomy.md | wc -l

# Check for unassigned routes
diff <(find app/api -name "route.ts" | sort) <(grep "^|" docs/architecture/frontend-backend-contract.md | grep "/api/" | sort)
```

---

## Appendix: Quick Stats

| Metric | Count | Source |
|--------|-------|--------|
| Total API Route Files | 211 | `find app/api -name "route.ts" \| wc -l` |
| FRONTEND routes | 160+ | This document |
| ADMIN routes | 18 | Routes in `/api/admin/*` |
| EXTERNAL routes | 8 | OAuth, webhooks, tracking, forms |
| TEST_ONLY routes | 4 | Only test file callers |
| UNKNOWN routes | 11 | No callers detected |
| Inngest Functions | 13 | `inngest/functions/index.ts` |
| Frontend Pages | 44 | Dashboard pages |
| Public/Auth Pages | 9 | Auth + info pages |
| Admin Pages | 6 | Separate admin-dashboard app |
| Domains | 8 | DOM-01 through DOM-08 |
| Workflows | 88 | WF-01.01 through WF-08.05 |

---

*Taxonomy reference: `docs/product/workflow-taxonomy.md` v3.0. Regenerate mapping with `npx tsx scripts/generate-api-map.ts`.*
