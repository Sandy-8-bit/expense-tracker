# Invoice & Expense Management System — Incremental UI and Workflow Updates

> **Instructions for Codex:** Read this entire file first, then inspect the existing application. Implement the changes **one at a time in the order below**, without rebuilding the application. Preserve existing business data, workflows, calculations, permissions, and styling conventions except where explicitly changed. Do not merely document tasks: change the actual code and verify the resulting behavior.

## 0. Before changing anything

1. Inspect the project structure, framework, package manager, existing components, database schema/migrations, import/export utilities, PDF generation, and relevant pages.
2. Identify existing shared UI primitives, filtering widgets, invoice creation, bank statement import/list, bank receipt classification, and side navigation.
3. Reuse existing libraries when practical. Add a small dependency only if needed and compatible with the project; do not introduce a second competing component system.
4. Do not delete or reset existing database records. If a migration is needed, create a safe additive migration and explain it.
5. **Create a new Markdown file at the project root named `IMPLEMENTATION_CHANGELOG.md` before making edits.** Keep it updated after **every completed task**. This file must be separate from this instruction file.
6. Use the screenshots shared with this request as design references, especially the oversized native company dropdown, the Categories layout, and the receipt-classification invoice inputs. Screenshots are illustrative; the actual codebase is the source of truth.

### Required format for `IMPLEMENTATION_CHANGELOG.md`

```md
# Implementation Change Log

## Project baseline
- Framework and relevant packages:
- Existing affected pages/components:
- Data/migration notes:

## Task 1 — Collapsible filters
- Status: Not started | In progress | Completed | Blocked
- Changed files:
- What changed:
- Behavior tested:
- Notes / remaining issues:

<!-- Repeat this structure for each task, including any extra fixes. -->

## Final verification
- Lint:
- Typecheck:
- Tests:
- Production build:
- Manual testing:
- Known issues:
```

Record **actual** files changed and actual test results; never report an unrun test as passing. Keep a concise record of any database migrations and important behavior decisions. If an item is blocked, mark it as blocked, state why, and proceed with independent items where possible.

## 1. Make all table/page filters collapsible

**Problem:** Filter areas remain expanded, taking up vertical space and pushing tables downward.

**Implement:**
- Audit **every** page with filters (including invoices, bank statements, expenses, categories, reports if present, and other lists).
- Add an obvious **Show filters / Hide filters** control with a chevron icon, keyboard accessibility, and expanded/collapsed state (`aria-expanded`).
- Keep filters collapsed by default on page load unless a particular screen requires them immediately; preserve the active filter values when the panel is collapsed.
- When collapsed, hide the filter inputs, remove their layout height, and let the table move up naturally. A compact indicator of active filter count plus **Clear filters** is useful.
- Keep search and important primary page actions visible outside the collapsed panel where appropriate.
- Responsive behavior must work on mobile and desktop without overlap or excessive gaps.

**Acceptance:** Every filter panel can open and close; table position changes immediately; existing filtering still works; collapsing does not reset selections.

## 2. Remove IGST from invoice creation

- Remove the **IGST input/option** from the invoice creation popup/form and any related creation-form validation.
- Review invoice calculation and PDF/display code for assumptions about IGST. Ensure the active GST inputs and totals still calculate correctly.
- **Do not erase historic IGST values or rewrite old invoices.** If old data uses IGST, preserve backward-compatible display/calculation where needed while preventing new IGST entry.
- Check create/edit behavior separately. If an edit screen handles historic IGST, do not silently corrupt those records.

**Acceptance:** No IGST control appears while creating a new invoice, other tax calculations remain correct, and old records retain their original values.

## 3. Provide a downloadable example Excel at every import point

- Find **every** Excel/CSV import entry point (bank statement, invoices, expenses, masters, or any others that exist).
- Add a visible **Download example Excel** action adjacent to each import control.
- Provide a distinct valid `.xlsx` template for each import type, with correct column headers, correct date/number formats, and 1–3 clearly fictional example rows. Include required/optional field guidance in the UI or an Instructions sheet if appropriate.
- Templates must be generated from or kept in sync with the actual import parser's supported schema. If a given import supports only CSV, explicitly label and provide the correct supported example format rather than pretending `.xlsx` is accepted; ideally support `.xlsx` if compatible with the existing design.
- Never include actual customer details, bank data, or other personal data.

**Acceptance:** Every import location offers a working sample download and a newly downloaded template is accepted by its corresponding importer (after filling required values).

## 4. Add drag-and-drop to every file import

- Add a reusable file drop zone around each existing file import: **Drag & drop a file, or browse files**.
- Support mouse, keyboard, and touchscreen file-picker fallback.
- Show drag-over highlight, selected file name, type/size validation, loading/progress or busy state, validation errors, and successful import result using existing application patterns.
- Respect only supported formats (for example `.xlsx`, `.xls`, `.csv` where genuinely supported); do not mislabel what the parser can read.
- Reuse the **same upload and validation pipeline** for drag/drop and browse; no duplicate import logic.
- Prevent accidental default browser file navigation on drop. Avoid uploading twice or bypassing existing duplicate detection and access control.

**Acceptance:** Both drop and browse import the same valid file successfully and reject the same invalid file clearly.

## 5. Fix PDF downloads throughout the application

- Inspect every PDF action (invoice PDF, statement PDF, receipts, export/print PDF, or any other existing feature).
- Clicking **Download PDF** must actually create/download a valid `.pdf` file, not just open an empty tab or silently fail.
- Ensure the correct selected record, calculations, company data, totals, and formatting appear in the PDF. Preserve existing branding and templates.
- Use appropriate `application/pdf` response headers and attachment filename for server downloads, or correctly create/revoke object URLs for client downloads.
- Handle pop-up blockers, missing data, server errors, and loading states without claiming success when no file was generated.
- Verify PDFs open correctly and contain expected content. Avoid treating browser print alone as a completed file download.

**Acceptance:** Every existing PDF download button yields a readable PDF for the selected record and has a meaningful failure state.

## 6. Replace native selects with consistent customized dropdowns

**Screenshot reference:** The company selector currently opens a large browser-native option list. Replace it with an app-styled dropdown.

- Audit **all visible select/dropdown controls**, including company selection, filter fields, category selectors, invoice selectors, and popup forms.
- Create/reuse an accessible shared custom Select component matching the existing app theme (teal accents, clean white surface, subtle border, consistent radii, focus ring, typography, spacing).
- Dropdown menus should open anchored to their trigger with suitable max height and **internal scrolling** when many options exist; avoid stretching pages or obscuring critical actions.
- Add searchable combobox behavior to long lists (companies, invoices, categories). For short lists, search may be optional.
- Include clear selected/hover/focus/disabled/empty states; support keyboard arrows, Enter/Space, Escape, Tab, focus management, and screen readers.
- Handle overflow, narrow layouts, dialogs, outside-click close, and viewport edges. Avoid clipping under dialog containers (use a portal if already supported).
- Do not replace useful true **multi-select** behavior with single-select; retain existing multi-select needs.
- Keep any existing labels, values, data bindings, filter logic, and form submission behavior unchanged.

**Acceptance:** No inconsistent oversized native-looking select remains in the primary application UI; menus remain usable inside modals and on small screens; all selections persist and submit correctly.

## 7. Align headings and standardize spacing

**Screenshot reference:** Categories heading, tab bar, helper text, search, record count, and Add record action need consistent alignment.

- Audit page headers across the app. Build/reuse a common page-header layout with consistent title baseline, top/bottom spacing, horizontal gutters, and primary-action alignment.
- Normalize vertical rhythm between heading, description, tabs, toolbar, filters, and table; avoid arbitrary page-specific margins.
- On the Categories page, align **Categories** and **+ Add record** in a single coherent header row (stack gracefully on mobile). Keep tabs, explanatory text, search, and count visually structured with equal consistent gaps.
- Ensure modal headings, field labels, footers, and button spacing follow a consistent scale.
- Maintain accessible font sizes and responsive layout; do not force equal spacing if it creates awkward empty areas.

**Acceptance:** Headers/actions align consistently across pages and no overlap, clipped controls, or unnecessary whitespace is introduced.

## 8. Delete one imported bank statement record

- Add a clear **Delete** action to each individual imported bank transaction/statement row (table action menu or row action), not just delete-an-entire-import functionality.
- Require a confirmation dialog that identifies the transaction (date, narration/description, amount), and explain what will be affected.
- Use the existing role/permission checks, including **server-side authorization**. Do not allow users without delete permission to delete via a direct API call.
- Check whether that statement row is linked to invoice receipts, expense allocations, categories, or reconciliation data. **Do not silently leave dangling references or incorrect invoice balances.** Choose the established business-safe approach: prevent deletion until linked allocations are removed, or atomically reverse those links before deleting with explicit user confirmation and audit trail.
- Deleting one row must leave all other records from the same import untouched. Update totals, counts, linked invoice balances and displayed lists accordingly.
- Prefer soft deletion/audit logging where existing schema/workflows support it. Prevent double deletion and provide errors on failure.

**Acceptance:** Authorized users can delete exactly one eligible bank transaction; related balances remain accurate; other imported rows are unchanged; unauthorized users are blocked.

## 9. Make the incoming bank receipt invoice selector searchable

**Screenshot reference:** In the **Classify incoming bank receipt** popup, invoices are currently presented as separate amount fields (e.g., INV-0002 and INV-0003). Replace the selection interaction with a **searchable invoice dropdown** and retain the ability to allocate one receipt across multiple invoices.

- Provide a searchable **Add invoice** combobox instead of listing all invoice amount fields immediately.
- Each option must clearly show **invoice number, company name, invoice date, and available unpaid amount**. Example option presentation:
  `INV-0002/26-27 · ABC Technologies · 11 Nov 2026 · Available ₹1,04,000.00`
  (Illustrative only; render actual invoice data.)
- Search by invoice number and company name; date may also be searchable if supported. Display dates consistently in the application's locale.
- Once selected, add the invoice to an **allocation list**, with editable amount input and a remove action. Users may add **multiple invoices** to split a single incoming receipt; prevent duplicate selection of an already-added invoice.
- Keep the **Other income amount** input and live **Unassigned remainder** calculation; calculate as:
  `receipt amount - sum(invoice allocations) - other income amount`.
- Validate amounts as currency using safe decimal arithmetic: no negatives, no allocation above the invoice's outstanding amount, no over-allocation above the receipt total, and no NaN/invalid entries. Define how rounding is handled to 2 decimals.
- Display company name and invoice date **in the dropdown and selected allocation rows**, not only the invoice number.
- Show relevant invoices based on established company/account scoping and permissions. Do not accidentally display unrelated companies' private data.
- Save classifications through existing backend/data relationships and ensure invoice received/outstanding amounts update correctly. Preserve and correctly load existing allocations when editing a classification.
- Disable saving when unassigned remainder is nonzero **if the current workflow requires full allocation**; otherwise follow the established rule and clearly inform the user. Do not silently discard unassigned money.

**Acceptance:** User can find an invoice by number/company, see its company/date/unpaid amount, select more than one invoice, allocate receipt amounts, remove selections, and save without incorrect invoice balances.

## 10. Fix side navigation so it does not scroll

- Keep the **side navigation panel stable** while the page content scrolls, e.g. a fixed/sticky sidebar with height bound to the viewport.
- Make the top brand, all primary navigation entries, and bottom actions fit in the available sidebar height at the normal supported desktop viewport. Adjust padding, gaps, item heights, or grouping responsively; do not hide important navigation links or make text too small.
- Ensure **no sidebar scroll bar** is needed at standard desktop sizes. If an unusually short viewport cannot physically fit all actions, use a deliberate compact/collapsed design or a safe accessible overflow fallback rather than cutting off links.
- Scroll only the main content area for normal usage. On mobile, preserve functional drawer navigation with all destinations reachable and proper focus/close behavior.
- Verify active states, navigation links, and the collapsed sidebar (if available) still work.

**Acceptance:** At normal desktop viewport sizes, sidebar stays still while content scrolls; all items remain visible; mobile behavior is usable.

---

## Implementation order and workflow rules

1. **Perform Task 0**, including creation of `IMPLEMENTATION_CHANGELOG.md`.
2. Implement Tasks **1 through 10 sequentially**. After each task:
   - Review the code diff and run appropriate focused checks.
   - Verify relevant success and failure interactions.
   - Update the corresponding section of `IMPLEMENTATION_CHANGELOG.md` with files, decisions, and actual checks.
   - Fix regressions before proceeding to the next task.
3. Prefer shared reusable components over per-page duplicated code, especially for select/combobox, filter toggle, import drop zone, and header layout.
4. Preserve existing persistence and data accuracy. Where functionality touches financial data, test create/edit/delete paths, reversals, outstanding balance calculations, and permissions.
5. Keep styling consistent with the project's current design tokens. Maintain accessibility, loading/empty/error states, and mobile responsiveness.
6. Follow the repository's configured package manager and formatting/linting conventions; don't migrate the stack or rebuild from scratch.
7. At the end, run available lint, type checks, tests, and production build. Fix issues caused by your changes; separately report any pre-existing failures.
8. Update the **Final verification** section of `IMPLEMENTATION_CHANGELOG.md` and include an easy-to-scan summary for all ten tasks.
9. In your final reply, provide: **completed tasks, files changed, migrations (if any), test outcomes, any blockers, and the exact path to `IMPLEMENTATION_CHANGELOG.md`**.

## Regression checklist

- Invoice creation still calculates totals correctly with IGST removed from new creation.
- Old invoice data remains readable; PDF downloads work and reflect the correct record.
- Excel templates match actual parsers; drag-and-drop and browse behave identically.
- Filters, selectors, multi-selects, and invoice allocation work after UI refactoring.
- Receipt allocation and bank transaction deletion do not cause invoice outstanding balances to drift.
- No new horizontal overflows, overlapping popovers, trapped focus, or inaccessible sidebar links.
- All additions/deletions respect existing authentication, permissions, and company scoping.
- No data wipe, unrelated design rewrite, or removal of existing functionality.
