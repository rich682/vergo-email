# Oversized File Refactor — QA Baselines

Captured: April 10, 2026
Environment: localhost:3002, TMG debug admin account

---

## 1. Report Builder (`app/dashboard/reports/[id]/page.tsx` — 3,513 lines)

**URL**: `/dashboard/reports/cmlqqtbcz0003n7ydxb3q7mc1` (All Projects P&L)

### Screenshots captured:
- **1a**: Top view — config panel (database source, filters, column sorting) + preview header (period selector, data table columns)
- **1b**: Mid-scroll — column header format, viewers (3 users), metric rows list (17 rows)
- **1c**: Full metric rows — source rows, formula rows (Gross Profit, GP%, Total COGs), compare rows (GP Monthly)

### UI elements to verify after refactor:
- [ ] Database source badge ("Project P&L, 634 rows")
- [ ] Filters section (expandable, gear icon)
- [ ] Column sorting dropdowns (Sort By, Direction)
- [ ] Column header format dropdown
- [ ] Viewers section with add/remove
- [ ] Metric rows list with drag reorder
- [ ] Source/Formula/Compare row badges and colors
- [ ] "+ Add Row" button
- [ ] Preview panel: period selector, data table, formula rows in table
- [ ] Settings button (top right)
- [ ] Back navigation

### Pre-existing issues:
- Hydration warning: `<button> cannot be a descendant of <button>` in ReportBuilderPage

---

## 2. Database Editor (`app/dashboard/databases/[id]/page.tsx` — 2,268 lines)

**URL**: `/dashboard/databases/cmlqqsicm0001n7ydsxzxs0sg` (Project P&L)

### Screenshots captured:
- **2a**: Data tab — table view with 634 rows, columns (Brand, Job#, Location, Project Name), search bar, checkboxes
- **2b**: Schema tab — Schema Definition view with 14 columns, Edit Schema button, column order/label/type table

### UI elements to verify after refactor:
- [ ] Data tab with row count badge
- [ ] Schema tab with column count badge
- [ ] Data table with sortable column headers
- [ ] Search bar ("Search all columns...")
- [ ] Row checkboxes for selection
- [ ] Template download button
- [ ] Export button
- [ ] Schema definition table (Order, Label, Type, Required)
- [ ] Edit Schema button
- [ ] Back navigation

### Pre-existing issues:
- None observed

---

## 3. Boards Page (`app/dashboard/boards/page.tsx` — 1,327 lines) + Board Service (`lib/services/board.service.ts` — 1,329 lines)

**URL**: `/dashboard/boards` and `/dashboard/jobs?boardId=cmlsuvn0o000tnwfzvunqhuhb`

### Screenshots captured:
- **3a**: Boards list — yearly view (2026), monthly periods with status badges (In Progress, Not Started), days until close, Overdue markers
- **3b**: Board detail (April 2026) — 33 tasks, status badge (In Progress), period dates, tabs (Tasks, Requests, Inbox, Documents), filters (My Tasks/Everyone, type, owner), AI Summary, status groups (Not Started 32, In Progress 1, Complete 0, Archived 0)

### UI elements to verify after refactor:
- [ ] Year selector with arrows
- [ ] Monthly period rows with status badges
- [ ] "Days until close" / "Overdue" labels
- [ ] "CURRENT" badge on active period
- [ ] Board detail: task count, status badge, period dates
- [ ] Tabs: Tasks, Requests, Inbox, Documents
- [ ] Filters: My Tasks/Everyone toggle, type/owner dropdowns, list/board view toggle
- [ ] AI Summary expandable section
- [ ] Status groups (collapsible with count)
- [ ] New Task / AI Bulk Add buttons

### Pre-existing issues:
- Board status dropdown opened when clicking "In Progress" badge (minor UX)

---

## 4. Send Request Modal (`components/jobs/send-request-modal.tsx` — 1,727 lines)

**URL**: Triggered from task detail pages via "Send Request" or "+" button in Requests tab

### Screenshots captured:
- Not directly captured — this is a modal component triggered from within task detail. No tasks with email request capability found in TMG's current data.

### UI elements to verify after refactor:
- [ ] Recipient selection step (contact search, recipient list)
- [ ] Draft composition step (subject, body, AI refinement)
- [ ] Data personalization flow (CSV upload, tag mapping)
- [ ] Attachment handling
- [ ] Send button with confirmation
- [ ] Modal open/close transitions
- [ ] Error states (no recipients, missing fields)

### Notes:
- This modal is the most complex component (1,727 lines) with multi-step wizard flow
- Requires a task with email request capability to test — create a new "request" type task before refactoring
- Test with: single recipient, multiple recipients, CSV personalization, attachment upload

---

## Refactor Priority Order

1. **Report Builder** (3,513 lines) — highest impact, most complex state
2. **Database Editor** (2,268 lines) — second largest, clear tab-based split
3. **Send Request Modal** (1,727 lines) — complex but isolated as a modal
4. **Board Service** (1,329 lines) — backend service, lower UI risk

## QA Process Per Refactor

1. Review baseline screenshots
2. Make the split (extract sub-components)
3. Run `npx vitest run` — all 566 tests must pass
4. Start dev server, navigate to same URLs
5. Take after screenshots, compare with baselines
6. Click through all UI elements in checklist
7. Check console for new errors (ignore pre-existing hydration warning)
8. Check network tab for failed API calls
9. If all green: commit and push
10. If any regression: `git revert` immediately
