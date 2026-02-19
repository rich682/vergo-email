# Documentation Skills Playbook

**Version**: 1.0
**Last Updated**: February 19, 2026
**Purpose**: Operational guide for maintaining the domain-driven taxonomy, contracts, and workflow documentation

---

## Table of Contents

- [Evidence Standards](#evidence-standards)
- [Domain Assignment Rules](#domain-assignment-rules)
- [How to Add a New Route](#how-to-add-a-new-route)
- [How to Add a New Workflow](#how-to-add-a-new-workflow)
- [How to Add a New Domain](#how-to-add-a-new-domain)
- [Full Regeneration Procedure](#full-regeneration-procedure)
- [Definition of Done Checklist](#definition-of-done-checklist)
- [Refactor Pre-Flight Checklist](#refactor-pre-flight-checklist)
- [PR Checklist](#pr-checklist)
- [Drift Detection Cadence](#drift-detection-cadence)

---

## Evidence Standards

### Caller Classification

Every API route in `frontend-backend-contract.md` must have a **Caller** classification:

| Caller | Meaning | Evidence Required |
|--------|---------|-------------------|
| FRONTEND | Called by a React page or component | `rg` match in `.tsx`/`.ts` file with `file:line` |
| SYSTEM | Called by Inngest function or server-side code | Inngest function name or `lib/services/` file reference |
| ADMIN | Called by admin dashboard only | Match in `admin-dashboard/` directory |
| EXTERNAL | Called by external webhook or tracking pixel | Webhook/tracking route path |
| TEST_ONLY | Has API route file but no production caller | No matches found via `rg` |
| UNKNOWN | Exists in code but caller not yet verified | Needs investigation |
| INTERNAL | Server-only utility, not directly called by frontend | Used by other API routes or middleware |

### Evidence Format

When documenting route-to-domain mappings:

```
| `/api/example/route` | GET, POST | WF-XX.YY | FRONTEND | `components/ExamplePage.tsx:42` |
```

- The evidence column must contain a `file:line` reference or Inngest function name
- For FRONTEND callers: search with `rg "example/route" --glob "*.tsx" --glob "*.ts" -n`
- For SYSTEM callers: check `inngest/functions/` directory
- For ADMIN callers: search `admin-dashboard/` directory

### Verifying UNKNOWN Routes

When you encounter an UNKNOWN caller route:

1. Run: `rg "route-path" --glob "*.tsx" --glob "*.ts" -n`
2. If found in frontend → reclassify as FRONTEND with evidence
3. If found in `lib/services/` or `inngest/` → reclassify as SYSTEM
4. If found in `admin-dashboard/` → reclassify as ADMIN
5. If no matches → mark as TEST_ONLY or candidate for deletion
6. Update `frontend-backend-contract.md` Section D (Orphan Triage)

---

## Domain Assignment Rules

When assigning a route or workflow to a domain, apply these rules in order:

### Rule 1: User Intent Defines Ownership

Ask: **"What business question is the user answering?"**

| Question | Domain |
|----------|--------|
| "Who am I? What can I do?" | DOM-01 |
| "How do I organize and track work?" | DOM-02 |
| "How do I send outreach and collect data?" | DOM-03 |
| "How do I review and resolve responses?" | DOM-04 |
| "How do I store, report, reconcile, analyze data?" | DOM-05 |
| "What should the system do automatically?" | DOM-06 |
| "How do I connect external systems?" | DOM-07 |
| "Operational overhead / admin tools" | DOM-08 |

### Rule 2: Route Prefix is the First Signal

| Prefix | Default Domain |
|--------|---------------|
| `/api/auth/*`, `/api/user/*`, `/api/org/*` | DOM-01 |
| `/api/boards/*`, `/api/task-instances/*`, `/api/entities/*`, `/api/groups/*` | DOM-02 |
| `/api/task-instances/[id]/request/*`, `/api/quests/*`, `/api/forms/*`, `/api/form-requests/*` | DOM-03 |
| `/api/inbox/*`, `/api/requests/*`, `/api/review/*` | DOM-04 |
| `/api/databases/*`, `/api/reports/*`, `/api/reconciliations/*`, `/api/analysis/*` | DOM-05 |
| `/api/agents/*`, `/api/automation-rules/*`, `/api/workflow-runs/*` | DOM-06 |
| `/api/oauth/*`, `/api/integrations/*`, `/api/email-accounts/*`, `/api/webhooks/*` | DOM-07 |
| `/api/admin/*`, `/api/internal/*`, `/api/errors/*`, `/api/notifications/*` | DOM-08 |

### Rule 3: Primary Beneficiary Test

When a route serves multiple domains (cross-domain), assign to the domain whose **user intent** it primarily serves. Document the secondary domain in the "Cross-Domain Routes" section of `workflow-taxonomy.md`.

Example: `/api/task-instances/[id]/requests` is a job sub-resource (DOM-02) even though it touches outreach data (DOM-03).

### Rule 4: System Processes → DOM-06

All Inngest functions, cron jobs, and background processes belong to DOM-06 regardless of what data they touch.

### Rule 5: Admin / Debug → DOM-08

All admin-only, debug, migration, and internal monitoring routes belong to DOM-08.

---

## How to Add a New Route

When a new API route is added to the codebase:

1. **Identify the route file**: `app/api/[path]/route.ts`
2. **Determine HTTP methods**: Read the file for exported `GET`, `POST`, `PATCH`, `PUT`, `DELETE` functions
3. **Apply domain assignment rules** (above) to determine the domain
4. **Find the caller**: `rg "route-path" --glob "*.tsx" --glob "*.ts" -n`
5. **Assign to a workflow**: Match to existing WF-XX.YY or create new (see below)
6. **Update three files**:
   - `frontend-backend-contract.md` → Add to Section C (Route Inventory) under the correct domain
   - `workflow-taxonomy.md` → Add to the relevant domain's workflow table (Primary API Routes column)
   - `workflows.md` → Add to the relevant workflow's "APIs Used" section (if user-facing)
7. **Update counts**: Increment route count in taxonomy Domain Overview and contract Appendix

---

## How to Add a New Workflow

When a genuinely new user capability is added:

1. **Identify the domain** using the assignment rules above
2. **Assign the next WF ID**: Look at the domain's existing workflows, take the next available `WF-XX.YY`
3. **Define the workflow**:
   - Name: Short action-oriented name
   - User Goal: One sentence starting with "User..."
   - Status: GREEN, YELLOW, or RED
   - Primary API Routes: List of routes that power this workflow
4. **Update four files**:
   - `workflow-taxonomy.md` → Add to domain's workflow table + Complete Workflow Index
   - `frontend-backend-contract.md` → Reference in Section C route entries
   - `workflows.md` → Add full step-by-step guide under the domain section
   - `workflow-taxonomy.md` → Increment workflow count in Domain Overview

---

## How to Add a New Domain

This should be rare (current: DOM-01 through DOM-08, DOM-09+ reserved).

1. **Justify the domain**: The new capability must not fit into any existing domain's boundary
2. **Assign DOM-09** (or next available)
3. **Define the boundary**: One sentence answering "Owns anything that answers..."
4. **Update all four files**:
   - `workflow-taxonomy.md` → New domain section with boundary, pages, route families, workflows
   - `frontend-backend-contract.md` → New Section C subsection, update Section A page mapping
   - `workflows.md` → New domain section with workflow guides
   - `skills.md` → Update Rule 1 and Rule 2 tables

---

## Full Regeneration Procedure

Use this when taxonomy has drifted significantly or after a major feature sprint.

### Step 1: Scan Routes

```bash
# Count all API route files
find app/api -name "route.ts" | wc -l

# List all route paths
find app/api -name "route.ts" | sed 's|app/api/||; s|/route.ts||' | sort
```

### Step 2: Scan Pages

```bash
# Count all page files
find app -name "page.tsx" | wc -l

# List all page paths
find app -name "page.tsx" | sed 's|app/||; s|/page.tsx||' | sort
```

### Step 3: Scan Inngest Functions

```bash
# List all registered Inngest functions
rg "createFunction|inngest\.(createFunction|cron)" inngest/functions/ -l
```

### Step 4: Map to Domains

For each route:
1. Apply prefix rule (Rule 2) for initial assignment
2. Verify with user-intent rule (Rule 1)
3. Find caller evidence: `rg "route-segment" --glob "*.tsx" --glob "*.ts" -n`
4. Record in spreadsheet or temp file

### Step 5: Verify Counts

```bash
# Routes per domain prefix
rg -l "export.*GET\|export.*POST" app/api/auth/ | wc -l      # DOM-01 partial
rg -l "export.*GET\|export.*POST" app/api/boards/ | wc -l     # DOM-02 partial
# ... etc for each prefix

# Total should match taxonomy Domain Overview table
```

### Step 6: Write Files

Write in this order (each depends on the previous):
1. `workflow-taxonomy.md` — Master source of truth
2. `frontend-backend-contract.md` — Route-level detail with evidence
3. `workflows.md` — User-facing guides
4. `skills.md` — Update if procedures changed

### Step 7: Verify

Run the Definition of Done checklist below.

---

## Definition of Done Checklist

Before considering a taxonomy update complete:

- [ ] `npm run build` passes with zero errors
- [ ] `npm test` passes (all existing tests)
- [ ] All WF IDs in `workflow-taxonomy.md` Complete Workflow Index match those in domain sections
- [ ] All WF IDs referenced in `frontend-backend-contract.md` Section C exist in taxonomy
- [ ] All WF IDs referenced in `workflows.md` headers match taxonomy
- [ ] Route count in taxonomy Domain Overview matches `find app/api -name "route.ts" | wc -l`
- [ ] No `PWF-` references remain outside the Legacy Crosswalk (grep: `rg "PWF-" docs/ --glob "*.md"`)
- [ ] No `WF-[0-9]+[a-z]` format IDs remain outside Legacy Crosswalk (grep: `rg "WF-[0-9]+[a-z]" docs/ --glob "*.md"`)
- [ ] Every UNKNOWN caller route has a verification command documented
- [ ] Cross-domain routes are documented in Orphans & Gaps section

---

## Refactor Pre-Flight Checklist

Before starting a code refactor that touches API routes:

- [ ] Read the current `workflow-taxonomy.md` to understand affected domains
- [ ] Identify which WF-XX.YY workflows will be affected
- [ ] Check `frontend-backend-contract.md` for all callers of affected routes
- [ ] Verify no cross-domain dependencies will break (check Orphans & Gaps)
- [ ] Plan documentation updates alongside code changes
- [ ] If renaming routes: search for old path in all `.tsx`, `.ts`, and `.md` files

---

## PR Checklist

For any PR that adds, removes, or modifies API routes or pages:

- [ ] New routes added to `frontend-backend-contract.md` Section C
- [ ] New routes assigned to a domain and workflow in `workflow-taxonomy.md`
- [ ] New user-facing workflows added to `workflows.md`
- [ ] Removed routes marked as deprecated or removed from all three docs
- [ ] Route counts updated in Domain Overview table
- [ ] Workflow counts updated if workflows added/removed
- [ ] No orphan WF IDs (referenced in one doc but not others)
- [ ] Legacy Crosswalk updated if old IDs were involved

---

## Drift Detection Cadence

### Weekly: Quick Count Check

```bash
# Compare actual route count to documented count
echo "Actual routes: $(find app/api -name 'route.ts' | wc -l)"
echo "Documented: 211"  # Update this number after each full regen

# Check for new route files not in docs
find app/api -name "route.ts" -newer docs/architecture/frontend-backend-contract.md
```

### Per-PR: Route Verification

Any PR that touches `app/api/` should include a comment confirming:
1. New routes are documented in all three docs
2. Removed routes are cleaned from all three docs
3. Route counts still match

### Monthly: Full Regeneration

Once per month (or after a major feature sprint), run the full regeneration procedure:
1. Scan all routes, pages, Inngest functions
2. Compare to documented inventory
3. Update any drift
4. Run Definition of Done checklist

### After Major Feature Sprint

If 5+ new routes or 2+ new workflows were added in a sprint, run:
1. Full regeneration procedure
2. Verify all new workflows have user-facing guides
3. Update Legacy Crosswalk if any old IDs were involved
4. Run `npm run build` and `npm test` to confirm no breakage
