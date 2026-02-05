# Workflow Taxonomy

**Version**: 1.5  
**Last Updated**: January 30, 2026  
**Purpose**: Hierarchical workflow structure enabling safe, ring-fenced refactoring

---

## Table of Contents

- [ID Assignment Rules](#id-assignment-rules)
- [Legacy ID Mapping](#legacy-id-mapping)
- [Parent Workflow Definitions](#parent-workflow-definitions)
- [Sub-Workflow Reference](#sub-workflow-reference)

---

## ID Assignment Rules

### Parent Workflow IDs
- Format: `PWF-XX` (e.g., PWF-01, PWF-02)
- Range: PWF-01 through PWF-09
- Reserved: PWF-10+ for future parent workflows

### Sub-Workflow IDs
- Format: `WF-XXy` where XX = parent number, y = letter suffix
- Examples: WF-01a, WF-01b, WF-03c
- Each parent can have up to 26 sub-workflows (a-z)

### Principles
1. **User intent defines ownership** - Workflows are grouped by what the user is trying to accomplish
2. **System processes are implementation details** - Background jobs belong to PWF-09 (System Automation)
3. **One sub-workflow = one JTBD** - Each sub-workflow represents a single job-to-be-done
4. **Routes can map to multiple sub-workflows** - A single API route may serve multiple user intents

---

## Legacy ID Mapping

| Legacy ID | New Sub-Workflow ID | Sub-Workflow Name | Notes |
|-----------|---------------------|-------------------|-------|
| WF-01 | WF-01a | Sign Up / Registration | Direct mapping |
| WF-02 | WF-01b | Sign In / Sign Out | Direct mapping |
| WF-03 | WF-01c | Password Reset | Direct mapping |
| WF-04 | WF-02a, WF-02b, WF-02g, WF-02h | Board CRUD operations | Split into granular sub-workflows |
| WF-05 | WF-02c | View Board with Jobs | Direct mapping |
| WF-06 | WF-03a | Create Job | Direct mapping |
| WF-07 | WF-05a, WF-05b, WF-05c | Send Request + Config | Split into granular sub-workflows |
| WF-08 | WF-05e | Track Request Status | Direct mapping |
| WF-09 | - | ~~Create Table Job~~ | REMOVED |
| WF-10 | - | ~~Import / Edit Table Data~~ | REMOVED |
| WF-11 | - | ~~Compare Periods / Variance~~ | REMOVED |
| WF-12 | - | ~~Create Reconciliation Job~~ | REMOVED |
| WF-13 | WF-06a, WF-06b, WF-06c, WF-06d | Evidence Collection | Split into granular sub-workflows |
| WF-14 | WF-05h | Reply Review | Direct mapping |
| WF-15 | WF-07a, WF-07b, WF-07c | Contact Management | Split into granular sub-workflows |
| WF-16 | WF-09a | Email Sync | Direct mapping |
| WF-17 | WF-09b | Message Classification | Direct mapping |
| WF-18 | WF-09c | Reminder Sending | Direct mapping |
| WF-19 | WF-09d | Email Queue Processing | Direct mapping |
| WF-20 | WF-08a, WF-08b | OAuth Connection | Split by provider |

---

## Parent Workflow Definitions

### PWF-01: Authentication & Onboarding

**Description**: User account creation, authentication, and team onboarding flows.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-01a | Sign Up / Registration | New user creates an account and organization | GREEN |
| WF-01b | Sign In / Sign Out | User authenticates to access dashboard | GREEN |
| WF-01c | Password Reset | User resets forgotten password via email | GREEN |
| WF-01d | Accept Team Invite | Invited user joins an existing organization | GREEN |

---

### PWF-02: Board Management

**Description**: Period-based organization of jobs through boards.

**Timezone Requirement**: Recurring boards require organization timezone to be configured. See `DEVELOPMENT_GUIDELINES.md` for date handling rules.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-02a | Create Board | User creates a new board for a period | GREEN |
| WF-02b | Edit Board Settings | User modifies board name, dates, or settings | GREEN |
| WF-02c | View Board with Jobs | User views all jobs assigned to a board | GREEN |
| WF-02d | Assign Board Collaborators | User adds team members to collaborate on a board | GREEN |
| WF-02e | Set Board Cadence / Periods | User configures recurring board schedule (requires timezone) | GREEN |
| WF-02f | Mark Board Complete | User marks board done, triggering snapshots | GREEN |
| WF-02g | Archive / Restore Board | User archives old boards or restores them | GREEN |
| WF-02h | Delete Board | User permanently removes a board | GREEN |

---

### PWF-03: Job Lifecycle

**Description**: Creation, configuration, and management of jobs (task instances).

> **Note**: Jobs are now type-agnostic. The `TaskType` enum has been removed. All jobs support all features.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-03a | Create Job | User creates a job for tracking work | GREEN |
| WF-03f | Archive / Restore Job | User archives completed jobs or restores them | GREEN |
| WF-03g | Delete Job | User permanently removes a job | GREEN |

---

### PWF-04: Job Collaboration & Governance

**Description**: Team collaboration, ownership, and governance controls on jobs.

> **Note**: Stakeholder linking to jobs has been removed. Recipients are now selected at request time.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-04b | Manage Job Collaborators | User adds internal team members to a job | GREEN |
| WF-04c | Assign / Change Job Owner | User transfers job ownership | GREEN |
| WF-04d | Set / Manage Job Deadlines | User sets or updates job due dates | GREEN |
| WF-04e | Manage Job Attachments | User uploads/manages files attached to job | YELLOW |
| WF-04f | Manage Job Notes | User adds internal notes to a job | GREEN |
| WF-04g | Job Activity & Comments | User views activity log and adds comments | GREEN |
| WF-04h | Job Status & Lifecycle | User changes job status (draft, active, complete) | GREEN |

---

### PWF-05: Requests & Communication

**Description**: Sending, tracking, and responding to email requests.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-05a | Send Email Request | User sends request emails to contacts | GREEN |
| WF-05b | Configure Request Personalization | User customizes emails with recipient data | GREEN |
| WF-05c | Configure Request Reminders | User sets up automatic reminder schedules | GREEN |
| WF-05d | Cancel / Resend Requests | User cancels pending or resends failed requests | YELLOW |
| WF-05e | Track Request Status | User monitors response status and risk levels | GREEN |
| WF-05f | Manually Override Request Risk | User manually adjusts risk classification | YELLOW |
| WF-05g | Mark Request Read / Unread | User marks requests as read/unread | YELLOW |
| WF-05h | Reply Review | User reviews replies with AI assistance | GREEN |
| WF-05o | Review Draft Requests | User reviews drafts copied from prior period in job header | GREEN |
| WF-05p | Edit Draft Request | User modifies draft subject, body, or recipient | GREEN |
| WF-05q | Send Draft Request | User sends a draft request after review | GREEN |
| WF-05r | Delete Draft Request | User removes an unwanted draft request | GREEN |

---

### PWF-06: Evidence Collection

**Description**: Collecting, reviewing, and exporting evidence/attachments.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-06a | Upload Evidence | User manually uploads evidence files | GREEN |
| WF-06b | Review / Approve Evidence | User reviews and approves collected evidence | GREEN |
| WF-06c | Bulk Evidence Actions | User performs bulk approve/reject/delete | GREEN |
| WF-06d | Export Evidence | User exports all evidence as CSV/ZIP | GREEN |

---

### PWF-07: Contact Management

**Description**: Managing contacts, groups, and contact organization.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-07a | Create / Edit Contact | User creates or updates contact information | GREEN |
| WF-07b | Import Contacts | User bulk imports contacts from CSV | GREEN |
| WF-07c | Group Contacts | User organizes contacts into groups | GREEN |
| WF-07d | Manage Contact Types / Labels | User defines and manages contact classifications | GREEN |
| WF-07e | Link Contacts to Jobs | User associates contacts with specific jobs | GREEN |
| WF-07f | Search / Select Contacts for Requests | User searches and selects recipients | GREEN |

---

### PWF-08: Email Account Management

**Description**: Connecting and managing email accounts for sending/receiving.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-08a | Connect Email Account - Gmail | User connects Gmail via OAuth | GREEN |
| WF-08b | Connect Email Account - Microsoft | User connects Microsoft 365 via OAuth | GREEN |
| WF-08c | Manage Email Senders | User configures which accounts can send | GREEN |

---

### PWF-09: System Automation (Non-User Initiated)

**Description**: Background processes that run without direct user action.

**Sub-Workflows**:
| Sub-ID | Name | Trigger | Status |
|--------|------|---------|--------|
| WF-09a | Email Sync - Gmail/Microsoft | Inngest cron (every 5 min) | GREEN |
| WF-09b | Message Classification | Inngest event (on message receive) | GREEN |
| WF-09c | Reminder Sending | Inngest cron (hourly) | GREEN |
| WF-09d | Email Queue Processing | Inngest cron (every minute) | GREEN |

---

### PWF-10: Data Management (Opt-In)

**Description**: Opt-in spreadsheet data management for any task. Define schemas, upload period data, track changes, add custom columns/rows, formula calculations, and cross-period navigation.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-10a | Enable Data for Task | User opts-in to Data management for any task | GREEN |
| WF-10b | Configure Data Schema | User uploads file to auto-detect columns, sets identity | GREEN |
| WF-10c | Upload Period Data | User uploads CSV data for current period | GREEN |
| WF-10d | Download Data Template | User downloads empty CSV template with headers | GREEN |
| WF-10e | Delete Data Schema | User deletes schema (only if no snapshots) | GREEN |
| WF-10f | View Data Hub | User views all tasks with Data enabled | GREEN |
| WF-10g | Add App Column to Data Grid | User adds custom columns (Notes, Status, Owner, Attachments, Formula) | GREEN |
| WF-10h | Update App Column Cell Values | User edits app column cell values for rows | GREEN |
| WF-10i | Filter Data Grid by Values | User filters columns using Excel-style multi-select | GREEN |
| WF-10j | Manage App Column Settings | User renames, reorders, or deletes app columns | GREEN |
| WF-10k | Add App Row to Data Grid | User adds custom rows (Text, Formula) | GREEN |
| WF-10l | Update App Row Cell Values | User edits text-type app row cell values | GREEN |
| WF-10m | Manage App Row Settings | User renames, reorders, or deletes app rows | GREEN |
| WF-10n | Navigate Period Sheets | User navigates between historical periods via tabs | GREEN |
| WF-10o | Create Formula Column | User creates formula column with per-row calculations | GREEN |
| WF-10p | Create Formula Row | User creates formula row with per-column aggregations | GREEN |

---

### PWF-11: Databases

**Description**: Standalone structured data stores with schema definitions, composite identifiers, and Excel import/export capabilities. Foundation for Reports feature.

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-11a | Create Database | User creates a new database with schema definition | GREEN |
| WF-11b | Edit Database Schema | User modifies database columns, types, or identifiers | GREEN |
| WF-11c | Import Database Rows | User uploads CSV/Excel data to append to database | GREEN |
| WF-11d | Export Database Data | User exports all database rows to Excel | GREEN |
| WF-11e | Download Database Template | User downloads empty Excel template with headers | GREEN |
| WF-11f | Delete Database | User permanently removes a database | GREEN |

---

### PWF-12: Reports

**Description**: Report definitions with column configuration, formula rows, pivot layouts, and variance analysis. Reports link to Databases for data sourcing. Users configure which columns can be used as filters, then generate fixed report snapshots (like Excel exports).

**Sub-Workflows**:
| Sub-ID | Name | User Goal | Status |
|--------|------|-----------|--------|
| WF-12a | Create Report Definition | User creates a new report definition linked to a database | GREEN |
| WF-12b | Configure Report Columns | User selects data columns and adds formula columns | GREEN |
| WF-12c | Configure Report Layout | User chooses standard or pivot layout, sets pivot column | GREEN |
| WF-12d | Configure Metric Rows | User adds source, formula, or comparison metric rows | GREEN |
| WF-12e | Configure Filter Columns | User selects which database columns can be used as filters | GREEN |
| WF-12f | Preview Report Definition | User previews report template with period selection | GREEN |
| WF-12g | Generate Report | User creates a fixed report snapshot with name, period, and filters | GREEN |
| WF-12h | View Generated Report | User views a previously generated report snapshot | GREEN |
| WF-12i | Export Report | User exports a generated report to Excel | GREEN |
| WF-12j | Delete Report Definition | User permanently removes a report definition | GREEN |
| WF-12k | Get AI Insights | User gets AI-powered analysis of a generated report | GREEN |

---

## Sub-Workflow Reference

### Complete Sub-Workflow Index

| Sub-ID | Parent | Name | Legacy ID | UI Entry Point | Primary API Routes |
|--------|--------|------|-----------|----------------|-------------------|
| WF-01a | PWF-01 | Sign Up / Registration | WF-01 | `/signup` | `POST /api/auth/signup` |
| WF-01b | PWF-01 | Sign In / Sign Out | WF-02 | `/auth/signin` | `POST /api/auth/[...nextauth]` |
| WF-01c | PWF-01 | Password Reset | WF-03 | `/auth/forgot-password` | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| WF-01d | PWF-01 | Accept Team Invite | - | `/auth/accept-invite` | `POST /api/auth/accept-invite` |
| WF-02a | PWF-02 | Create Board | WF-04 | `/dashboard/boards` | `POST /api/boards` |
| WF-02b | PWF-02 | Edit Board Settings | WF-04 | `/dashboard/boards` | `PATCH /api/boards/[id]` |
| WF-02c | PWF-02 | View Board with Jobs | WF-05 | `/dashboard/jobs` | `GET /api/boards/[id]`, `GET /api/task-instances` |
| WF-02d | PWF-02 | Assign Board Collaborators | - | `/dashboard/boards` | `POST /api/boards/team-members` |
| WF-02e | PWF-02 | Set Board Cadence / Periods | - | `/dashboard/boards` | `PATCH /api/boards/[id]` |
| WF-02f | PWF-02 | Mark Board Complete | - | `/dashboard/boards` | `PATCH /api/boards/[id]` (status=COMPLETE) |
| WF-02g | PWF-02 | Archive / Restore Board | WF-04 | `/dashboard/boards` | `PATCH /api/boards/[id]` (archived flag) |
| WF-02h | PWF-02 | Delete Board | WF-04 | `/dashboard/boards` | `DELETE /api/boards/[id]` |
| WF-03a | PWF-03 | Create Job | WF-06 | `/dashboard/jobs` | `POST /api/task-instances` |
| WF-03f | PWF-03 | Archive / Restore Job | - | `/dashboard/jobs` | `PATCH /api/task-instances/[id]` (archived flag) |
| WF-03g | PWF-03 | Delete Job | - | `/dashboard/jobs` | `DELETE /api/task-instances/[id]` |
| WF-04b | PWF-04 | Manage Job Collaborators | - | `/dashboard/jobs/[id]` | `GET/POST/DELETE /api/task-instances/[id]/collaborators` |
| WF-04c | PWF-04 | Assign / Change Job Owner | - | `/dashboard/jobs/[id]` | `PATCH /api/task-instances/[id]` (ownerId) |
| WF-04d | PWF-04 | Set / Manage Job Deadlines | - | `/dashboard/jobs/[id]` | `PATCH /api/task-instances/[id]` (deadline) |
| WF-04e | PWF-04 | Manage Job Attachments | - | `/dashboard/jobs/[id]` | `GET/POST /api/task-instances/[id]/attachments` |
| WF-04f | PWF-04 | Manage Job Notes | - | `/dashboard/jobs/[id]` | `PATCH /api/task-instances/[id]` (notes) |
| WF-04g | PWF-04 | Job Activity & Comments | - | `/dashboard/jobs/[id]` | `GET/POST /api/task-instances/[id]/comments`, `GET /api/task-instances/[id]/timeline` |
| WF-04h | PWF-04 | Job Status & Lifecycle | - | `/dashboard/jobs/[id]` | `PATCH /api/task-instances/[id]` (status) |
| WF-05a | PWF-05 | Send Email Request | WF-07 | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/request/draft`, `POST /api/quests/[id]/execute` |
| WF-05b | PWF-05 | Configure Request Personalization | WF-07 | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/request/dataset/*` |
| WF-05c | PWF-05 | Configure Request Reminders | WF-07 | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/request/draft` (reminderConfig) |
| WF-05d | PWF-05 | Cancel / Resend Requests | - | `/dashboard/requests` | `DELETE /api/requests/detail/[id]/reminders` |
| WF-05e | PWF-05 | Track Request Status | WF-08 | `/dashboard/requests` | `GET /api/requests/detail/[id]`, `GET /api/requests/detail/[id]/messages` |
| WF-05f | PWF-05 | Manually Override Request Risk | - | `/dashboard/requests` | `PUT /api/requests/detail/[id]/risk` |
| WF-05g | PWF-05 | Mark Request Read / Unread | - | `/dashboard/requests` | `POST /api/requests/detail/[id]/mark-read` |
| WF-05h | PWF-05 | Reply Review | WF-14 | `/dashboard/review/[messageId]` | `GET/PATCH /api/review/[messageId]`, `POST /api/review/analyze` |
| WF-05o | PWF-05 | Review Draft Requests | - | `/dashboard/jobs/[id]` | `GET /api/task-instances/[id]/requests?includeDrafts=true` |
| WF-05p | PWF-05 | Edit Draft Request | - | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/requests` (action: update) |
| WF-05q | PWF-05 | Send Draft Request | - | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/requests` (action: send) |
| WF-05r | PWF-05 | Delete Draft Request | - | `/dashboard/jobs/[id]` | `DELETE /api/task-instances/[id]/requests` |
| WF-06a | PWF-06 | Upload Evidence | WF-13 | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/collection` |
| WF-06b | PWF-06 | Review / Approve Evidence | WF-13 | `/dashboard/jobs/[id]` | `PATCH /api/task-instances/[id]/collection/[itemId]` |
| WF-06c | PWF-06 | Bulk Evidence Actions | WF-13 | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/collection/bulk` |
| WF-06d | PWF-06 | Export Evidence | WF-13 | `/dashboard/jobs/[id]` | `GET /api/task-instances/[id]/collection/export` |
| WF-07a | PWF-07 | Create / Edit Contact | WF-15 | `/dashboard/contacts` | `POST /api/entities`, `PATCH /api/entities/[id]` |
| WF-07b | PWF-07 | Import Contacts | WF-15 | `/dashboard/contacts` | `POST /api/entities/import`, `POST /api/entities/bulk` |
| WF-07c | PWF-07 | Group Contacts | WF-15 | `/dashboard/contacts` | `POST /api/groups`, `POST /api/groups/[id]/members` |
| WF-07d | PWF-07 | Manage Contact Types / Labels | - | `/dashboard/contacts` | `GET/POST /api/contact-types` |
| WF-07f | PWF-07 | Search / Select Contacts for Requests | - | `/dashboard/jobs/[id]` | `GET /api/recipients/search`, `GET /api/recipients/all` |
| WF-08a | PWF-08 | Connect Email Account - Gmail | WF-20 | `/dashboard/settings/team` | `GET /api/oauth/gmail`, `GET /api/oauth/gmail/callback` |
| WF-08b | PWF-08 | Connect Email Account - Microsoft | WF-20 | `/dashboard/settings/team` | `GET /api/oauth/microsoft`, `GET /api/oauth/microsoft/callback` |
| WF-08c | PWF-08 | Manage Email Senders | - | `/dashboard/settings/team` | `GET /api/email-accounts`, `PATCH /api/email-accounts/[id]` |
| WF-09a | PWF-09 | Email Sync - Gmail/Microsoft | WF-16 | None (System) | None (Inngest) |
| WF-09b | PWF-09 | Message Classification | WF-17 | None (System) | None (Inngest) |
| WF-09c | PWF-09 | Reminder Sending | WF-18 | None (System) | None (Inngest) |
| WF-09d | PWF-09 | Email Queue Processing | WF-19 | None (System) | None (Inngest) |
| WF-10a | PWF-10 | Enable Data for Task | - | `/dashboard/jobs/[id]` | `POST /api/task-instances/[id]/data/enable` |
| WF-10b | PWF-10 | Configure Data Schema | - | `/dashboard/jobs/[id]` | `POST /api/data/tasks/[taskId]/schema` |
| WF-10c | PWF-10 | Upload Period Data | - | `/dashboard/jobs/[id]` | `POST /api/datasets/[id]/snapshots` |
| WF-10d | PWF-10 | Download Data Template | - | `/dashboard/jobs/[id]` | Client-side generation |
| WF-10e | PWF-10 | Delete Data Schema | - | `/dashboard/jobs/[id]` | `DELETE /api/datasets/[id]` |
| WF-10f | PWF-10 | View Data Hub | - | `/dashboard/data` | `GET /api/data/tasks` |
| WF-10g | PWF-10 | Add App Column to Data Grid | - | `/dashboard/jobs/[id]` | `POST /api/task-lineages/[id]/app-columns` |
| WF-10h | PWF-10 | Update App Column Cell Values | - | `/dashboard/jobs/[id]` | `PATCH /api/task-lineages/[id]/app-columns/[id]/values/[row]` |
| WF-10i | PWF-10 | Filter Data Grid by Values | - | `/dashboard/jobs/[id]` | Client-side filtering |
| WF-10j | PWF-10 | Manage App Column Settings | - | `/dashboard/jobs/[id]` | `PATCH/DELETE /api/task-lineages/[id]/app-columns/[id]` |
| WF-10k | PWF-10 | Add App Row to Data Grid | - | `/dashboard/jobs/[id]` | `POST /api/task-lineages/[id]/app-rows` |
| WF-10l | PWF-10 | Update App Row Cell Values | - | `/dashboard/jobs/[id]` | `PATCH /api/task-lineages/[id]/app-rows/[id]/values/[col]` |
| WF-10m | PWF-10 | Manage App Row Settings | - | `/dashboard/jobs/[id]` | `PATCH/DELETE /api/task-lineages/[id]/app-rows/[id]` |
| WF-10n | PWF-10 | Navigate Period Sheets | - | `/dashboard/jobs/[id]` | Client-side tab navigation |
| WF-10o | PWF-10 | Create Formula Column | - | `/dashboard/jobs/[id]` | `POST /api/task-lineages/[id]/app-columns` (formula) |
| WF-10p | PWF-10 | Create Formula Row | - | `/dashboard/jobs/[id]` | `POST /api/task-lineages/[id]/app-rows` (formula) |
| WF-11a | PWF-11 | Create Database | - | `/dashboard/databases/new` | `POST /api/databases` |
| WF-11b | PWF-11 | Edit Database Schema | - | `/dashboard/databases/[id]` | `PATCH /api/databases/[id]/schema` |
| WF-11c | PWF-11 | Import Database Rows | - | `/dashboard/databases/[id]` | `POST /api/databases/[id]/import` |
| WF-11d | PWF-11 | Export Database Data | - | `/dashboard/databases/[id]` | `GET /api/databases/[id]/export.xlsx` |
| WF-11e | PWF-11 | Download Database Template | - | `/dashboard/databases/[id]` | `GET /api/databases/[id]/template.xlsx` |
| WF-11f | PWF-11 | Delete Database | - | `/dashboard/databases` | `DELETE /api/databases/[id]` |
| WF-12a | PWF-12 | Create Report Definition | - | `/dashboard/reports/new` | `POST /api/reports` |
| WF-12b | PWF-12 | Configure Report Columns | - | `/dashboard/reports/[id]` | `PATCH /api/reports/[id]` |
| WF-12c | PWF-12 | Configure Report Layout | - | `/dashboard/reports/[id]` | `PATCH /api/reports/[id]` |
| WF-12d | PWF-12 | Configure Metric Rows | - | `/dashboard/reports/[id]` | `PATCH /api/reports/[id]` |
| WF-12e | PWF-12 | Configure Filter Columns | - | `/dashboard/reports/[id]` | `PATCH /api/reports/[id]` |
| WF-12f | PWF-12 | Preview Report Definition | - | `/dashboard/reports/[id]` | `POST /api/reports/[id]/preview` |
| WF-12g | PWF-12 | Generate Report | - | `/dashboard/reports` | `POST /api/generated-reports` |
| WF-12h | PWF-12 | View Generated Report | - | `/dashboard/reports` | `GET /api/generated-reports` |
| WF-12i | PWF-12 | Export Report | - | `/dashboard/reports` | Client-side Excel export |
| WF-12j | PWF-12 | Delete Report Definition | - | `/dashboard/reports` | `DELETE /api/reports/[id]` |
| WF-12k | PWF-12 | Get AI Insights | - | `/dashboard/reports` | `POST /api/reports/[id]/insights` |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Parent Workflows | 12 |
| Sub-Workflows | 77 |
| GREEN Status | 70 |
| YELLOW Status | 7 |
| RED Status | 0 |
| System Automation | 4 |
| User-Initiated | 72 |

## Removed Features (February 2026)

The following features and workflows have been removed:

| Removed | Reason |
|---------|--------|
| WF-03b: Create Table Job | Table feature removed |
| WF-03c: Create Reconciliation Job | Reconciliation feature removed |
| WF-03d: Import / Edit Table Data | Table feature removed |
| WF-03e: Compare Periods / Variance | Table feature removed |
| WF-04a: Manage Job Stakeholders | Stakeholder linking removed - recipients selected at request time |
| WF-07e: Link Contacts to Jobs | Stakeholder linking removed |
