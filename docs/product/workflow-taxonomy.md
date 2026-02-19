# Workflow Taxonomy

**Version**: 3.0 (Domain-Driven Model)
**Last Updated**: February 19, 2026
**Purpose**: Domain-driven workflow structure enabling safe, ring-fenced refactoring

---

## Table of Contents

- [ID Format & Rules](#id-format--rules)
- [Domain Overview](#domain-overview)
- [DOM-01: Identity & Organization](#dom-01-identity--organization)
- [DOM-02: Planning & Work Execution](#dom-02-planning--work-execution)
- [DOM-03: Outreach & Data Collection](#dom-03-outreach--data-collection)
- [DOM-04: Inbound Review & Resolution](#dom-04-inbound-review--resolution)
- [DOM-05: Data Intelligence](#dom-05-data-intelligence)
- [DOM-06: Automation & Agents](#dom-06-automation--agents)
- [DOM-07: Integrations & Delivery Channels](#dom-07-integrations--delivery-channels)
- [DOM-08: Platform Ops & Internal](#dom-08-platform-ops--internal)
- [Complete Workflow Index](#complete-workflow-index)
- [Legacy Crosswalk](#legacy-crosswalk)
- [Orphans & Gaps](#orphans--gaps)
- [Removed Features](#removed-features)
- [Summary Statistics](#summary-statistics)

---

## ID Format & Rules

### Domain IDs
- Format: `DOM-XX` (e.g., DOM-01, DOM-02)
- Range: DOM-01 through DOM-08 (reserved: DOM-09+ for future domains)

### Workflow IDs
- Format: `WF-XX.YY` where XX = domain number, YY = zero-padded sequential number
- Examples: WF-01.01, WF-02.11, WF-05.14
- Each domain can have up to 99 workflows (01–99)

### Principles
1. **User intent defines ownership** — Workflows are grouped by the business question the user is answering
2. **Route prefix is the first signal** — `/api/boards/*` → DOM-02, `/api/admin/*` → DOM-08
3. **Cross-domain routes use "primary beneficiary" test** — A route that serves multiple domains belongs to the domain whose user intent it primarily serves
4. **System processes → DOM-06** — All Inngest functions and background jobs
5. **Admin/debug → DOM-08** — All operational overhead

---

## Domain Overview

| Domain | Name | Boundary | Routes | Pages | Workflows |
|--------|------|----------|--------|-------|-----------|
| DOM-01 | Identity & Organization | Who is the user, what org, what permissions? | 18 | 13 | 9 |
| DOM-02 | Planning & Work Execution | Organize, plan, track, complete work | 46 | 9 | 23 |
| DOM-03 | Outreach & Data Collection | Reach out and collect responses/data | 34 | 4 | 12 |
| DOM-04 | Inbound Review & Resolution | Review and resolve incoming responses | 17 | 4 | 8 |
| DOM-05 | Data Intelligence | Store data, generate reports, reconcile, analyze | 40 | 11 | 14 |
| DOM-06 | Automation & Agents | What the system does automatically | 16 (+13 Inngest) | 6 | 12 |
| DOM-07 | Integrations & Delivery Channels | Connect external systems | 16 | 2 | 5 |
| DOM-08 | Platform Ops & Internal | Operational overhead, admin, monitoring | 24 | 7 | 5 |

---

## DOM-01: Identity & Organization

**Boundary**: Anything that answers "Who is the user, what organization are they in, and what can they do?" Covers authentication, user profiles, team management, role permissions, and org-level configuration. Excludes feature-specific settings (accounting calendar is org config, but email accounts are DOM-07).

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Landing | `/` |
| Terms | `/terms` |
| Privacy | `/privacy` |
| Sign Up | `/signup` |
| Sign In | `/auth/signin` |
| Verify Email | `/auth/verify-email` |
| Forgot Password | `/auth/forgot-password` |
| Reset Password | `/auth/reset-password` |
| Accept Invite | `/auth/accept-invite` |
| Profile | `/dashboard/profile` |
| Settings (General) | `/dashboard/settings` |
| Settings / Team | `/dashboard/settings/team` |
| Settings / Role Permissions | `/dashboard/settings/role-permissions` |

**Route Families**: `/api/auth/*`, `/api/user/*`, `/api/users`, `/api/org/*`, `/api/contacts/type-counts`, `/api/contacts/custom-types`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-01.01 | Sign Up / Registration | New user creates an account and organization | GREEN | `POST /api/auth/signup` |
| WF-01.02 | Sign In / Sign Out | User authenticates to access dashboard | GREEN | `POST /api/auth/[...nextauth]` |
| WF-01.03 | Password Reset | User resets forgotten password via email | GREEN | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| WF-01.04 | Accept Team Invite | Invited user joins an existing organization | GREEN | `GET/POST /api/auth/accept-invite` |
| WF-01.05 | Manage User Profile | User updates their name, email, signature | GREEN | `GET/PATCH /api/user/profile`, `GET/PUT /api/user/signature` |
| WF-01.06 | Onboarding Checklist | User completes onboarding steps | GREEN | `GET/POST /api/user/onboarding` |
| WF-01.07 | Team Management | Admin manages team members: invite, edit roles, remove | GREEN | `GET /api/org/team`, `GET/POST /api/org/users`, `GET/PATCH/DELETE /api/org/users/[id]` |
| WF-01.08 | Role Permissions Configuration | Admin configures action permissions per role | GREEN | `GET/PUT /api/org/role-permissions` |
| WF-01.09 | Organization Settings | Admin configures org name, timezone, fiscal year, contact types | GREEN | `GET/PUT /api/org/settings`, `GET/PUT /api/org/accounting-calendar`, `POST/DELETE /api/contacts/custom-types` |

---

## DOM-02: Planning & Work Execution

**Boundary**: Anything driven by "I need to organize, plan, track, and complete work items." Covers boards, jobs, job sub-resources (comments, collaborators, labels, attachments, timeline, collection/evidence, contact-labels, config), task lineages, bulk operations, and contacts. Excludes outbound communication (DOM-03) and inbound review (DOM-04).

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Dashboard (home) | `/dashboard` |
| Boards | `/dashboard/boards` |
| Jobs List | `/dashboard/jobs` |
| Job Detail | `/dashboard/jobs/[id]` |
| Collection | `/dashboard/collection` |
| Collection / Invoices | `/dashboard/collection/invoices` |
| Collection / Expenses | `/dashboard/collection/expenses` |
| Contacts | `/dashboard/contacts` |
| Campaigns | `/dashboard/campaigns` |

**Route Families**: `/api/boards/*`, `/api/task-instances/*` (excluding `request/*`), `/api/task-lineages/*`, `/api/collection/*`, `/api/attachments/*`, `/api/entities/*`, `/api/groups/*`, `/api/templates/contacts`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-02.01 | Create Board | User creates a new board for a period | GREEN | `POST /api/boards` |
| WF-02.02 | Edit Board Settings | User modifies board name, dates, or settings | GREEN | `PATCH /api/boards/[id]` |
| WF-02.03 | View Board with Jobs | User views all jobs assigned to a board | GREEN | `GET /api/boards/[id]`, `GET /api/task-instances` |
| WF-02.04 | Assign Board Collaborators | User adds team members to collaborate on a board | GREEN | `GET /api/boards/team-members` |
| WF-02.05 | Set Board Cadence / Periods | User configures recurring board schedule | GREEN | `PATCH /api/boards/[id]` |
| WF-02.06 | Mark Board Complete | User marks board done, triggering snapshots and rollover | GREEN | `PATCH /api/boards/[id]` (status=COMPLETE) |
| WF-02.07 | Archive / Restore Board | User archives old boards or restores them | GREEN | `PATCH /api/boards/[id]` |
| WF-02.08 | Delete Board | User permanently removes a board | GREEN | `DELETE /api/boards/[id]` |
| WF-02.09 | View Board Close Summary | User views AI close retrospective for a completed board | GREEN | `GET /api/boards/[id]/close-summary` |
| WF-02.10 | Close Speed Analytics | User sees close-speed metric and board AI summary | GREEN | `GET /api/boards/[id]/ai-summary` |
| WF-02.11 | Create Job | User creates a job for tracking work | GREEN | `POST /api/task-instances` |
| WF-02.12 | Archive / Restore Job | User archives completed jobs or restores them | GREEN | `PATCH /api/task-instances/[id]` |
| WF-02.13 | Delete Job | User permanently removes a job | GREEN | `DELETE /api/task-instances/[id]` |
| WF-02.14 | Manage Job Collaborators | User adds/removes internal team members on a job | GREEN | `GET/POST/DELETE /api/task-instances/[id]/collaborators` |
| WF-02.15 | Assign / Change Job Owner | User transfers job ownership | GREEN | `PATCH /api/task-instances/[id]` |
| WF-02.16 | Set / Manage Job Deadlines | User sets or updates job due dates | GREEN | `PATCH /api/task-instances/[id]` |
| WF-02.17 | Manage Job Attachments | User uploads/manages files attached to job | YELLOW | `GET/POST /api/task-instances/[id]/attachments` |
| WF-02.18 | Job Activity & Comments | User views activity log and adds comments | GREEN | `GET /api/task-instances/[id]/timeline`, `GET/POST/DELETE /api/task-instances/[id]/comments` |
| WF-02.19 | Job Status & Lifecycle | User changes job status (draft, active, complete) | GREEN | `PATCH /api/task-instances/[id]` |
| WF-02.20 | Evidence Collection & Review | User uploads, reviews, approves/rejects, exports evidence | GREEN | `GET/POST /api/task-instances/[id]/collection`, `PATCH/DELETE .../[itemId]`, `POST .../bulk`, `GET .../download`, `GET .../export` |
| WF-02.21 | Contact Management | User creates, edits, imports, groups contacts | GREEN | `GET/POST /api/entities`, `PATCH/DELETE /api/entities/[id]`, `POST /api/entities/bulk`, `POST /api/entities/import`, `GET/POST /api/groups`, `PATCH/DELETE /api/groups/[id]` |
| WF-02.22 | Bulk Job Import & AI Generate | User imports jobs in bulk or uses AI to generate | GREEN | `POST /api/task-instances/bulk-import`, `POST /api/task-instances/ai-generate` |
| WF-02.23 | Job AI Summary | User gets AI summary of job or request status | GREEN | `POST /api/task-instances/[id]/ai-summary`, `POST /api/task-instances/ai-summary` |

---

## DOM-03: Outreach & Data Collection

**Boundary**: Anything driven by "I need to reach out to external recipients and collect responses or data." Covers the send side of communication: drafting, personalizing, sending, form distribution, quests. Excludes the receive/review side (DOM-04).

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Forms List | `/dashboard/forms` |
| Form Builder | `/dashboard/forms/[id]` |
| New Form | `/dashboard/forms/new` |
| Form Submission (public) | `/forms/[requestId]` |

**Route Families**: `/api/task-instances/[id]/request/*`, `/api/quests/*`, `/api/email-drafts/*`, `/api/request-templates/*`, `/api/recipients/*`, `/api/forms/*`, `/api/form-requests/*`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-03.01 | Send Email Request | User sends request emails to contacts | GREEN | `GET /api/task-instances/[id]/request/draft`, `POST .../refine` |
| WF-03.02 | Configure Request Personalization | User customizes emails with recipient-specific data | GREEN | `GET/PATCH /api/task-instances/[id]/request/dataset`, `POST .../upload`, `GET/POST .../preview`, `POST .../send` |
| WF-03.03 | Configure Request Reminders | User sets up automatic reminder schedules | GREEN | `POST /api/task-instances/[id]/request/reminder-preview` |
| WF-03.04 | Review & Send Draft Requests | User reviews drafts from prior period, edits, sends or deletes | GREEN | `GET/POST/DELETE /api/task-instances/[id]/requests` |
| WF-03.05 | Manage Request Templates | User creates/edits reusable request templates | GREEN | `GET/POST /api/request-templates`, `GET/PATCH/DELETE /api/request-templates/[id]` |
| WF-03.06 | Search / Select Recipients | User searches and selects recipients for requests | GREEN | `GET /api/recipients/search`, `GET /api/recipients/all` |
| WF-03.07 | Quest Execution | User creates and executes quests (AI-assisted outreach) | GREEN | `GET/POST /api/quests`, `POST /api/quests/[id]/execute`, `POST /api/quests/[id]/generate`, `POST /api/quests/standing` |
| WF-03.08 | Create / Edit Form | User creates or modifies a form template | GREEN | `GET/POST /api/forms`, `GET/PATCH/DELETE /api/forms/[id]` |
| WF-03.09 | Send Form Request | User sends a form link to a recipient | GREEN | `GET/POST /api/task-instances/[id]/form-requests`, `GET /api/form-requests/[id]/request` |
| WF-03.10 | Submit Form Response | Recipient completes and submits the form | GREEN | `GET/POST /api/form-requests/token/[token]`, `POST /api/form-requests/[id]/submit`, `GET/POST/DELETE /api/form-requests/[id]/attachments` |
| WF-03.11 | Remind Form Recipient | User sends a reminder to a form recipient | GREEN | `POST /api/form-requests/[id]/remind` |
| WF-03.12 | Manage Form Viewers | User manages who can view form responses | GREEN | `GET/PUT /api/forms/[id]/viewers` |

---

## DOM-04: Inbound Review & Resolution

**Boundary**: Anything driven by "A response came back and I need to review, classify, and resolve it." Covers the receive side: inbox, request detail views, reply review, risk overrides, mark-read, retry.

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Inbox | `/dashboard/inbox` |
| Requests List | `/dashboard/requests` |
| Request Detail | `/dashboard/requests/[key]` |
| Reply Review | `/dashboard/review/[messageId]` |

**Route Families**: `/api/inbox/*`, `/api/requests/*`, `/api/review/*`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-04.01 | View Inbox | User views incoming messages and unread counts | GREEN | `GET /api/inbox`, `GET /api/inbox/count` |
| WF-04.02 | Track Request Status | User monitors response status and risk levels | GREEN | `GET /api/requests`, `GET /api/requests/detail/[id]`, `GET .../messages` |
| WF-04.03 | Cancel / Resend Requests | User cancels pending or resends failed requests | YELLOW | `POST /api/requests/detail/[id]/retry`, `PATCH /api/requests/detail/[id]` |
| WF-04.04 | Mark Request Read / Unread | User marks requests as read/unread | YELLOW | `POST /api/requests/detail/[id]/mark-read` |
| WF-04.05 | Manually Override Request Risk | User manually adjusts risk classification | YELLOW | `PUT /api/requests/detail/[id]/risk` |
| WF-04.06 | Reply Review | User reviews replies with AI analysis and recommendations | GREEN | `GET/PATCH /api/review/[messageId]`, `POST /api/review/analyze` |
| WF-04.07 | Send Reply | User composes and sends a reply to a request response | GREEN | `POST /api/review/draft-reply`, `POST /api/requests/detail/[id]/reply`, `POST .../reply-draft` |
| WF-04.08 | Accept AI Suggestion | User accepts AI-recommended action on a request | GREEN | `POST /api/requests/[id]/accept-suggestion` |

---

## DOM-05: Data Intelligence

**Boundary**: Anything driven by "I need to store structured data, generate reports, reconcile datasets, or analyze data with AI." Standalone data stores and intelligence features that are not tied to a single job.

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Databases List | `/dashboard/databases` |
| Database Detail | `/dashboard/databases/[id]` |
| New Database | `/dashboard/databases/new` |
| Reports List | `/dashboard/reports` |
| Report Detail | `/dashboard/reports/[id]` |
| New Report | `/dashboard/reports/new` |
| Reconciliations List | `/dashboard/reconciliations` |
| New Reconciliation | `/dashboard/reconciliations/new` |
| Reconciliation Detail | `/dashboard/reconciliations/[configId]` |
| Analysis | `/dashboard/analysis` |
| Analysis Chat | `/dashboard/analysis/chat/[id]` |

**Route Families**: `/api/databases/*`, `/api/reports/*`, `/api/generated-reports/*`, `/api/reconciliations/*`, `/api/analysis/*`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-05.01 | Create Database | User creates a new database with schema definition | GREEN | `POST /api/databases` |
| WF-05.02 | Edit Database Schema | User modifies database columns, types, or identifiers | GREEN | `PATCH /api/databases/[id]/schema` |
| WF-05.03 | Import Database Rows | User uploads CSV/Excel data to append to database | GREEN | `POST /api/databases/[id]/import/preview`, `POST /api/databases/[id]/import` |
| WF-05.04 | Export Database Data | User exports all database rows to Excel | GREEN | `GET /api/databases/[id]/export.xlsx`, `GET /api/databases/[id]/template.xlsx` |
| WF-05.05 | Delete Database | User permanently removes a database | GREEN | `DELETE /api/databases/[id]` |
| WF-05.06 | Create Report Definition | User creates a report linked to a database | GREEN | `POST /api/reports` |
| WF-05.07 | Configure & Preview Report | User configures columns, layout, metrics, filters, previews | GREEN | `PATCH /api/reports/[id]`, `GET/POST /api/reports/[id]/preview`, `GET /api/reports/[id]/filter-properties` |
| WF-05.08 | Generate & View Report | User creates fixed report snapshot and views it | GREEN | `POST /api/generated-reports`, `GET /api/generated-reports/[id]`, `POST /api/generated-reports/ensure-for-task` |
| WF-05.09 | Export Report | User exports a generated report to Excel | GREEN | `GET /api/generated-reports/[id]/export` |
| WF-05.10 | AI Report Insights | User gets AI-powered analysis of a generated report | GREEN | `POST /api/reports/[id]/insights`, `GET/POST /api/generated-reports/[id]/insights` |
| WF-05.11 | Reconciliation Configuration | User creates/edits reconciliation configs and manages viewers | GREEN | `GET/POST /api/reconciliations`, `GET/PATCH/DELETE /api/reconciliations/[configId]`, `GET/PUT .../viewers` |
| WF-05.12 | Reconciliation Execution | User runs matching, uploads data, loads databases, reviews exceptions, completes | GREEN | `GET/POST /api/reconciliations/[configId]/runs`, `GET .../[runId]`, `POST .../upload`, `POST .../load-database`, `POST .../match`, `POST .../accept-match`, `PATCH .../exceptions`, `POST .../complete` |
| WF-05.13 | Reconciliation AI Analysis | User gets AI analysis suggestions for reconciliation | GREEN | `POST /api/reconciliations/analyze`, `POST /api/reconciliations/suggest-mappings` |
| WF-05.14 | Analysis Conversations | User starts AI conversations and queries data | GREEN | `GET/POST /api/analysis/conversations`, `GET/DELETE /api/analysis/conversations/[id]`, `POST .../[id]/messages` |

---

## DOM-06: Automation & Agents

**Boundary**: Anything driven by "The system should do this automatically" or "An AI agent should handle this." Covers user-configured automation (agents, automation rules, workflow runs) and system-level background processes (Inngest functions for email sync, message classification, reminders, queue processing, board automation).

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Agents List | `/dashboard/agents` |
| Agent Detail | `/dashboard/agents/[id]` |
| Automations List | `/dashboard/automations` |
| New Automation | `/dashboard/automations/new` |
| Automation Detail | `/dashboard/automations/[id]` |
| Workflow Run Detail | `/dashboard/automations/[id]/runs/[runId]` |

**Route Families**: `/api/agents/*`, `/api/automation-rules/*`, `/api/workflow-runs/*`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-06.01 | Create / Edit Agent | User creates or configures an agent | GREEN | `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/[agentId]` |
| WF-06.02 | Execute Agent | User triggers an agent execution | GREEN | `POST /api/agents/[agentId]/execute` |
| WF-06.03 | View Agent Executions | User views execution history and status | GREEN | `GET /api/agents/[agentId]/executions`, `GET .../[executionId]`, `GET .../status` |
| WF-06.04 | Cancel Agent Execution | User cancels a running execution | GREEN | `POST /api/agents/[agentId]/executions/[executionId]/cancel` |
| WF-06.05 | Agent Memory & Metrics | User views agent memory and performance metrics | GREEN | `GET /api/agents/[agentId]/memory`, `GET /api/agents/[agentId]/metrics` |
| WF-06.06 | Agent Execution Feedback | User provides feedback on execution results | GREEN | `POST /api/agents/[agentId]/executions/[executionId]/feedback` |
| WF-06.07 | Create / Edit Automation Rule | User creates or modifies automation rules | GREEN | `GET/POST /api/automation-rules`, `GET/PATCH/DELETE /api/automation-rules/[id]` |
| WF-06.08 | Run Automation | User manually triggers or system auto-triggers a run | GREEN | `POST /api/automation-rules/[id]/run` |
| WF-06.09 | View Workflow Runs | User views run history, details, and approves pending runs | GREEN | `GET /api/workflow-runs`, `GET /api/workflow-runs/[id]`, `POST /api/workflow-runs/[id]/approve` |
| WF-06.10 | Email Sync | System syncs inbound emails from Gmail and Microsoft every minute | GREEN | Inngest: `sync-gmail-accounts`, `sync-microsoft-accounts` |
| WF-06.11 | Message Classification & Summarization | System classifies inbound messages and generates AI summaries | GREEN | Inngest: `classify-message`, `summarize-task` |
| WF-06.12 | Reminder & Queue Processing | System sends due reminders, processes email queue, auto-creates period boards | GREEN | Inngest: `reminder/send-due`, `process-email-queue`, `quest/execute-standing`, `auto-create-period-boards`, `workflow-scheduler`, `workflow-run`, `workflow-trigger-dispatcher` |

---

## DOM-07: Integrations & Delivery Channels

**Boundary**: Anything driven by "I need to connect an external system or manage a delivery channel." OAuth flows, webhook receivers, tracking pixels, email account management, accounting system integrations.

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Settings / Integrations | `/dashboard/settings/integrations` |
| Settings / Accounting | `/dashboard/settings/accounting` |

**Route Families**: `/api/oauth/*`, `/api/integrations/*`, `/api/email-accounts/*`, `/api/webhooks/*`, `/api/tracking/*`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-07.01 | Connect Email Account - Gmail | User connects Gmail via OAuth | GREEN | `GET /api/oauth/gmail`, `GET /api/oauth/gmail/callback` |
| WF-07.02 | Connect Email Account - Microsoft | User connects Microsoft 365 via OAuth | GREEN | `GET /api/oauth/microsoft`, `GET /api/oauth/microsoft/callback` |
| WF-07.03 | Manage Email Senders | User views and disconnects email accounts | GREEN | `GET /api/email-accounts`, `DELETE /api/email-accounts/[id]` |
| WF-07.04 | Accounting Integration | User connects, configures, syncs, and disconnects accounting system | GREEN | `POST /api/integrations/accounting/link-token`, `POST .../connect`, `DELETE .../disconnect`, `GET .../status`, `PUT .../config`, `POST .../sync`, `GET .../sources`, `POST .../preview` |
| WF-07.05 | Webhook & Tracking | System receives Gmail webhooks and tracks email opens | GREEN | `POST /api/webhooks/gmail`, `GET /api/tracking/[token]` |

---

## DOM-08: Platform Ops & Internal

**Boundary**: Anything driven by "This is operational overhead, not user-facing product functionality." Admin tools, debug endpoints, internal metrics, error reporting, and cross-cutting platform services like notifications.

**Entry-Point Pages**:

| Page | URL |
|------|-----|
| Admin Dashboard | `admin-dashboard/` |
| Admin Login | `admin-dashboard/login` |
| Admin Errors | `admin-dashboard/errors` |
| Admin Activity | `admin-dashboard/activity` |
| Admin Companies | `admin-dashboard/companies` |
| Admin Company Detail | `admin-dashboard/companies/[id]` |

> Note: The admin dashboard is a separate Next.js app at `admin-dashboard/`.

**Route Families**: `/api/admin/*`, `/api/internal/*`, `/api/errors/*`, `/api/inngest`, `/api/notifications/*`

### Workflows

| WF ID | Name | User Goal | Status | Primary API Routes |
|-------|------|-----------|--------|--------------------|
| WF-08.01 | Admin Debug & Diagnostics | Admin debugs accounts, messages, sync, collection, blobs | GREEN | `GET/POST /api/admin/debug-accounts`, `GET /api/admin/debug-blob`, `GET /api/admin/debug-collection`, `GET /api/admin/debug-email-sync`, `GET/POST /api/admin/debug-messages`, `GET /api/admin/debug/[taskId]` |
| WF-08.02 | Admin Backfill & Migration | Admin runs backfills and data migrations | GREEN | `GET /api/admin/backfill-file-urls`, `POST /api/admin/backfill-completion`, `POST /api/admin/backfill-risk`, `POST /api/admin/migrate` |
| WF-08.03 | Admin Data Cleanup | Admin cleans up orphan requests, deletes users, syncs manually | GREEN | `POST /api/admin/cleanup-requests`, `DELETE /api/admin/delete-user`, `POST /api/admin/sync-emails`, `POST /api/admin/sync-gmail-now`, `POST /api/admin/reminders/run-once` |
| WF-08.04 | System Health & Monitoring | System health checks, pipeline status, error reporting, AI metrics | GREEN | `GET /api/admin/health-check`, `GET /api/admin/pipeline-status`, `GET /api/admin/check-replies`, `POST /api/errors/report`, `GET /api/internal/ai-metrics/agreement`, `POST /api/inngest` |
| WF-08.05 | Notifications | System delivers in-app notifications, user reads/dismisses | GREEN | `GET/PATCH /api/notifications`, `PATCH /api/notifications/[id]`, `GET /api/notifications/count` |

---

## Complete Workflow Index

| WF ID | Domain | Name | Status |
|-------|--------|------|--------|
| WF-01.01 | DOM-01 | Sign Up / Registration | GREEN |
| WF-01.02 | DOM-01 | Sign In / Sign Out | GREEN |
| WF-01.03 | DOM-01 | Password Reset | GREEN |
| WF-01.04 | DOM-01 | Accept Team Invite | GREEN |
| WF-01.05 | DOM-01 | Manage User Profile | GREEN |
| WF-01.06 | DOM-01 | Onboarding Checklist | GREEN |
| WF-01.07 | DOM-01 | Team Management | GREEN |
| WF-01.08 | DOM-01 | Role Permissions Configuration | GREEN |
| WF-01.09 | DOM-01 | Organization Settings | GREEN |
| WF-02.01 | DOM-02 | Create Board | GREEN |
| WF-02.02 | DOM-02 | Edit Board Settings | GREEN |
| WF-02.03 | DOM-02 | View Board with Jobs | GREEN |
| WF-02.04 | DOM-02 | Assign Board Collaborators | GREEN |
| WF-02.05 | DOM-02 | Set Board Cadence / Periods | GREEN |
| WF-02.06 | DOM-02 | Mark Board Complete | GREEN |
| WF-02.07 | DOM-02 | Archive / Restore Board | GREEN |
| WF-02.08 | DOM-02 | Delete Board | GREEN |
| WF-02.09 | DOM-02 | View Board Close Summary | GREEN |
| WF-02.10 | DOM-02 | Close Speed Analytics | GREEN |
| WF-02.11 | DOM-02 | Create Job | GREEN |
| WF-02.12 | DOM-02 | Archive / Restore Job | GREEN |
| WF-02.13 | DOM-02 | Delete Job | GREEN |
| WF-02.14 | DOM-02 | Manage Job Collaborators | GREEN |
| WF-02.15 | DOM-02 | Assign / Change Job Owner | GREEN |
| WF-02.16 | DOM-02 | Set / Manage Job Deadlines | GREEN |
| WF-02.17 | DOM-02 | Manage Job Attachments | YELLOW |
| WF-02.18 | DOM-02 | Job Activity & Comments | GREEN |
| WF-02.19 | DOM-02 | Job Status & Lifecycle | GREEN |
| WF-02.20 | DOM-02 | Evidence Collection & Review | GREEN |
| WF-02.21 | DOM-02 | Contact Management | GREEN |
| WF-02.22 | DOM-02 | Bulk Job Import & AI Generate | GREEN |
| WF-02.23 | DOM-02 | Job AI Summary | GREEN |
| WF-03.01 | DOM-03 | Send Email Request | GREEN |
| WF-03.02 | DOM-03 | Configure Request Personalization | GREEN |
| WF-03.03 | DOM-03 | Configure Request Reminders | GREEN |
| WF-03.04 | DOM-03 | Review & Send Draft Requests | GREEN |
| WF-03.05 | DOM-03 | Manage Request Templates | GREEN |
| WF-03.06 | DOM-03 | Search / Select Recipients | GREEN |
| WF-03.07 | DOM-03 | Quest Execution | GREEN |
| WF-03.08 | DOM-03 | Create / Edit Form | GREEN |
| WF-03.09 | DOM-03 | Send Form Request | GREEN |
| WF-03.10 | DOM-03 | Submit Form Response | GREEN |
| WF-03.11 | DOM-03 | Remind Form Recipient | GREEN |
| WF-03.12 | DOM-03 | Manage Form Viewers | GREEN |
| WF-04.01 | DOM-04 | View Inbox | GREEN |
| WF-04.02 | DOM-04 | Track Request Status | GREEN |
| WF-04.03 | DOM-04 | Cancel / Resend Requests | YELLOW |
| WF-04.04 | DOM-04 | Mark Request Read / Unread | YELLOW |
| WF-04.05 | DOM-04 | Manually Override Request Risk | YELLOW |
| WF-04.06 | DOM-04 | Reply Review | GREEN |
| WF-04.07 | DOM-04 | Send Reply | GREEN |
| WF-04.08 | DOM-04 | Accept AI Suggestion | GREEN |
| WF-05.01 | DOM-05 | Create Database | GREEN |
| WF-05.02 | DOM-05 | Edit Database Schema | GREEN |
| WF-05.03 | DOM-05 | Import Database Rows | GREEN |
| WF-05.04 | DOM-05 | Export Database Data | GREEN |
| WF-05.05 | DOM-05 | Delete Database | GREEN |
| WF-05.06 | DOM-05 | Create Report Definition | GREEN |
| WF-05.07 | DOM-05 | Configure & Preview Report | GREEN |
| WF-05.08 | DOM-05 | Generate & View Report | GREEN |
| WF-05.09 | DOM-05 | Export Report | GREEN |
| WF-05.10 | DOM-05 | AI Report Insights | GREEN |
| WF-05.11 | DOM-05 | Reconciliation Configuration | GREEN |
| WF-05.12 | DOM-05 | Reconciliation Execution | GREEN |
| WF-05.13 | DOM-05 | Reconciliation AI Analysis | GREEN |
| WF-05.14 | DOM-05 | Analysis Conversations | GREEN |
| WF-06.01 | DOM-06 | Create / Edit Agent | GREEN |
| WF-06.02 | DOM-06 | Execute Agent | GREEN |
| WF-06.03 | DOM-06 | View Agent Executions | GREEN |
| WF-06.04 | DOM-06 | Cancel Agent Execution | GREEN |
| WF-06.05 | DOM-06 | Agent Memory & Metrics | GREEN |
| WF-06.06 | DOM-06 | Agent Execution Feedback | GREEN |
| WF-06.07 | DOM-06 | Create / Edit Automation Rule | GREEN |
| WF-06.08 | DOM-06 | Run Automation | GREEN |
| WF-06.09 | DOM-06 | View Workflow Runs | GREEN |
| WF-06.10 | DOM-06 | Email Sync | GREEN |
| WF-06.11 | DOM-06 | Message Classification & Summarization | GREEN |
| WF-06.12 | DOM-06 | Reminder & Queue Processing | GREEN |
| WF-07.01 | DOM-07 | Connect Email Account - Gmail | GREEN |
| WF-07.02 | DOM-07 | Connect Email Account - Microsoft | GREEN |
| WF-07.03 | DOM-07 | Manage Email Senders | GREEN |
| WF-07.04 | DOM-07 | Accounting Integration | GREEN |
| WF-07.05 | DOM-07 | Webhook & Tracking | GREEN |
| WF-08.01 | DOM-08 | Admin Debug & Diagnostics | GREEN |
| WF-08.02 | DOM-08 | Admin Backfill & Migration | GREEN |
| WF-08.03 | DOM-08 | Admin Data Cleanup | GREEN |
| WF-08.04 | DOM-08 | System Health & Monitoring | GREEN |
| WF-08.05 | DOM-08 | Notifications | GREEN |

---

## Legacy Crosswalk

Maps old PWF-XX / WF-XXy identifiers to new DOM-XX / WF-XX.YY identifiers.

| Legacy Parent | Legacy Sub-WF | New Domain | New WF ID | New Name | Notes |
|---------------|---------------|------------|-----------|----------|-------|
| PWF-01 | WF-01a | DOM-01 | WF-01.01 | Sign Up / Registration | Direct |
| PWF-01 | WF-01b | DOM-01 | WF-01.02 | Sign In / Sign Out | Direct |
| PWF-01 | WF-01c | DOM-01 | WF-01.03 | Password Reset | Direct |
| PWF-01 | WF-01d | DOM-01 | WF-01.04 | Accept Team Invite | Direct |
| PWF-02 | WF-02a | DOM-02 | WF-02.01 | Create Board | Direct |
| PWF-02 | WF-02b | DOM-02 | WF-02.02 | Edit Board Settings | Direct |
| PWF-02 | WF-02c | DOM-02 | WF-02.03 | View Board with Jobs | Direct |
| PWF-02 | WF-02d | DOM-02 | WF-02.04 | Assign Board Collaborators | Direct |
| PWF-02 | WF-02e | DOM-02 | WF-02.05 | Set Board Cadence / Periods | Direct |
| PWF-02 | WF-02f | DOM-02 | WF-02.06 | Mark Board Complete | Direct |
| PWF-02 | WF-02g | DOM-02 | WF-02.07 | Archive / Restore Board | Direct |
| PWF-02 | WF-02h | DOM-02 | WF-02.08 | Delete Board | Direct |
| PWF-02 | WF-02i | DOM-06 | WF-06.12 | Reminder & Queue Processing | System process moved to DOM-06 |
| PWF-02 | WF-02j | DOM-02 | WF-02.09 | View Board Close Summary | Direct |
| PWF-02 | WF-02k | DOM-02 | WF-02.10 | Close Speed Analytics | Direct |
| PWF-03 | WF-03a | DOM-02 | WF-02.11 | Create Job | Direct |
| PWF-03 | WF-03f | DOM-02 | WF-02.12 | Archive / Restore Job | Direct |
| PWF-03 | WF-03g | DOM-02 | WF-02.13 | Delete Job | Direct |
| PWF-03 | WF-03h | DOM-02 | WF-02.19 | Job Status & Lifecycle | Merged |
| PWF-04 | WF-04b | DOM-02 | WF-02.14 | Manage Job Collaborators | Direct |
| PWF-04 | WF-04c | DOM-02 | WF-02.15 | Assign / Change Job Owner | Direct |
| PWF-04 | WF-04d | DOM-02 | WF-02.16 | Set / Manage Job Deadlines | Direct |
| PWF-04 | WF-04e | DOM-02 | WF-02.17 | Manage Job Attachments | Direct |
| PWF-04 | WF-04g | DOM-02 | WF-02.18 | Job Activity & Comments | Direct |
| PWF-04 | WF-04h | DOM-02 | WF-02.19 | Job Status & Lifecycle | Direct |
| PWF-05 | WF-05a | DOM-03 | WF-03.01 | Send Email Request | Direct |
| PWF-05 | WF-05b | DOM-03 | WF-03.02 | Configure Request Personalization | Direct |
| PWF-05 | WF-05c | DOM-03 | WF-03.03 | Configure Request Reminders | Direct |
| PWF-05 | WF-05d | DOM-04 | WF-04.03 | Cancel / Resend Requests | Moved to inbound |
| PWF-05 | WF-05e | DOM-04 | WF-04.02 | Track Request Status | Moved to inbound |
| PWF-05 | WF-05f | DOM-04 | WF-04.05 | Manually Override Request Risk | Moved to inbound |
| PWF-05 | WF-05g | DOM-04 | WF-04.04 | Mark Request Read / Unread | Moved to inbound |
| PWF-05 | WF-05h | DOM-04 | WF-04.06 | Reply Review | Moved to inbound |
| PWF-05 | WF-05o/p/q/r | DOM-03 | WF-03.04 | Review & Send Draft Requests | Merged 4 → 1 |
| PWF-05 | WF-05s | DOM-03 | WF-03.05 | Manage Request Templates | Direct |
| PWF-06 | WF-06a/b/c/d | DOM-02 | WF-02.20 | Evidence Collection & Review | Merged 4 → 1 |
| PWF-07 | WF-07a/b/c | DOM-02 | WF-02.21 | Contact Management | Merged 3 → 1 |
| PWF-07 | WF-07f | DOM-03 | WF-03.06 | Search / Select Recipients | Direct |
| PWF-08 | WF-08a | DOM-07 | WF-07.01 | Connect Email Account - Gmail | Direct |
| PWF-08 | WF-08b | DOM-07 | WF-07.02 | Connect Email Account - Microsoft | Direct |
| PWF-08 | WF-08c | DOM-07 | WF-07.03 | Manage Email Senders | Direct |
| PWF-08 | WF-08d/e | DOM-07 | WF-07.04 | Accounting Integration | Merged 2 → 1 |
| PWF-09 | WF-09a | DOM-06 | WF-06.10 | Email Sync | Direct |
| PWF-09 | WF-09b | DOM-06 | WF-06.11 | Message Classification & Summarization | Direct |
| PWF-09 | WF-09c/d | DOM-06 | WF-06.12 | Reminder & Queue Processing | Merged 2 → 1 |
| PWF-09 | WF-09e | DOM-08 | WF-08.05 | Notifications | Direct |
| PWF-11 | WF-11a-f | DOM-05 | WF-05.01–05.05 | Databases | Consolidated |
| PWF-12 | WF-12a-k | DOM-05 | WF-05.06–05.10 | Reports | Consolidated |
| PWF-13 | WF-13a-g | DOM-06 | WF-06.01–06.06 | Agents | Consolidated |
| PWF-14 | WF-14a-e | DOM-06 | WF-06.07–06.09 | Automations | Consolidated |
| PWF-15 | WF-15a-c | DOM-05 | WF-05.14 | Analysis Conversations | Consolidated |
| PWF-16 | WF-16a-g | DOM-03 | WF-03.08–03.12 | Forms | Consolidated |
| PWF-17 | WF-17a-k | DOM-05 | WF-05.11–05.13 | Reconciliations | Consolidated |

---

## Orphans & Gaps

### Cross-Domain Routes

These routes are assigned to a primary domain but serve multiple domains. Documented here for refactoring awareness.

| Route | Primary Domain | Secondary Domain | Reason |
|-------|---------------|------------------|--------|
| `/api/task-instances/[id]/requests` | DOM-02 | DOM-03, DOM-04 | Job sub-resource that touches outreach/inbound data |
| `/api/task-instances/[id]/form-requests` | DOM-02 | DOM-03 | Job sub-resource that touches form data |
| `/api/org/accounting-calendar` | DOM-01 | DOM-07 | Org setting that configures integration behavior |
| `/api/contacts/type-counts` | DOM-01 | DOM-02 | Org config that relates to contact management |
| `/api/contacts/custom-types` | DOM-01 | DOM-02 | Org config that relates to contact management |
| `/api/boards/team-members` | DOM-02 | DOM-01 | Board collaborators involves org users |
| `/api/generated-reports/ensure-for-task` | DOM-05 | DOM-02 | Reports triggered from job context |

### UNKNOWN Caller Routes

These routes exist in code but have no confirmed frontend caller. May be used by other services, test-only, or orphaned.

| Route | Domain | Verification Command |
|-------|--------|---------------------|
| `/api/attachments/[id]` | DOM-02 | `rg "attachments/" --glob "*.tsx" --glob "*.ts" -l` |
| `/api/attachments/by-key/[key]` | DOM-02 | Same as above |
| `/api/attachments/download/[id]` | DOM-02 | Same as above |
| `/api/requests/detail` (base) | DOM-04 | Candidate for deletion — detail/[id] is the actual endpoint |
| `/api/requests/detail/[id]/mark-read` | DOM-04 | `rg "mark-read" --glob "*.tsx" -l` |
| `/api/requests/detail/[id]/reminder-draft` | DOM-04 | `rg "reminder-draft" --glob "*.tsx" -l` |
| `/api/requests/detail/[id]/risk` | DOM-04 | `rg "/risk" --glob "*.tsx" -l` |
| `/api/task-instances/[id]/labels/[labelId]` | DOM-02 | `rg "labels/" --glob "*.tsx" -l` |
| `/api/quests/[id]` | DOM-03 | `rg "quests/" --glob "*.tsx" -l` |
| `/api/quests/context` | DOM-03 | Same as above |
| `/api/quests/interpret` | DOM-03 | Same as above |

### TEST_ONLY Routes

These routes have no production frontend caller. They exist for test or development purposes.

| Route | Domain | Notes |
|-------|--------|-------|
| `/api/email-drafts/[id]` | DOM-03 | Legacy email draft CRUD |
| `/api/email-drafts/[id]/send` | DOM-03 | Legacy email draft send |
| `/api/email-drafts/csv-upload` | DOM-03 | Legacy CSV upload |
| `/api/email-drafts/generate` | DOM-03 | Legacy draft generation |

---

## Removed Features

| Feature | Legacy IDs | Notes |
|---------|------------|-------|
| Table Jobs | WF-09, WF-10 | Replaced by Databases (DOM-05) |
| Period Variance | WF-11 | Replaced by Reports + Reconciliations (DOM-05) |
| TaskType enum | — | All jobs are now type-agnostic |
| Stakeholder linking | — | Recipients selected at request time |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Domains | 8 |
| Workflows | 88 |
| GREEN workflows | 84 |
| YELLOW workflows | 4 |
| RED workflows | 0 |
| API route files | 211 |
| Inngest functions | 13 |
| Dashboard pages | 44 |
| Public/auth pages | 9 |
| Admin pages | 6 |
| Cross-domain routes | 7 |
| UNKNOWN caller routes | 11 |
| TEST_ONLY routes | 4 |
