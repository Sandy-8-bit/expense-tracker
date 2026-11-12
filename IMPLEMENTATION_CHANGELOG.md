# Implementation Change Log

## Project baseline

- Framework and relevant packages: Next.js 16.4.6, React 19, TypeScript, pnpm, Tailwind v4, Radix Dialog, TanStack Query/Table, Decimal.js, ExcelJS, Supabase.
- Existing affected pages/components: workspace.tsx, transactions.tsx, classify-dialog.tsx, import-statement.tsx, reports.tsx, invoice-details.tsx, shared finance UI.
- Data/migration notes: Existing production data must be preserved. Database changes require additive migrations. PDF exports currently use browser print; no PDF generation library is installed.

## Task 1 — Collapsible filters

- Status: Completed
- Changed files: src/components/ui/finance.tsx, src/features/reports.tsx, src/features/transactions.tsx
- What changed: Shared collapsed-by-default filter panel with chevron and aria-expanded; report/date/transaction filters retain mounted state. Search and primary actions stay visible. Register pages have search and category navigation only.
- Behavior tested: Typecheck passed; reviewed controlled values and hidden panel semantics.
- Notes / remaining issues: Browser interaction verification pending.

## Task 2 — Remove IGST from creation

- Status: Completed
- Changed files: src/features/workspace.tsx, src/lib/schemas.ts
- What changed: Creation hides IGST and defaults it to zero; schema rejects new nonzero IGST. Existing invoice editing/calculation preserves IGST.
- Behavior tested: Existing 16 tests passed, including invoice calculations.
- Notes / remaining issues: No historical records changed.

## Task 3 — Example Excel downloads

- Status: Completed
- Changed files: src/lib/statement-template.ts, src/lib/download.ts, src/features/import-statement.tsx, tests/statement-template.test.ts
- What changed: Bank import (the only import entry point) offers a valid XLSX with fictional rows, date/currency formats and Instructions sheet.
- Behavior tested: Generated workbook reloaded and parsed successfully; dedicated roundtrip test passed.
- Notes / remaining issues: None.

## Task 4 — Import drop zones

- Status: Completed
- Changed files: src/components/ui/file-drop-zone.tsx, src/features/import-statement.tsx, app/workspace.css
- What changed: Shared drop/browse validation for single CSV/XLSX up to 10 MB, selected filename, drag highlight, busy/error states. Both paths clear stale previews and use existing authenticated import pipeline.
- Behavior tested: Typecheck passed. Reviewed invalid extension, empty/oversized/multiple files and drop default prevention.
- Notes / remaining issues: Interactive browser verification pending.

## Task 5 — PDF downloads

- Status: Completed
- Changed files: src/lib/report-pdf.ts, src/features/reports.tsx, tests/report-pdf.test.ts, package.json, pnpm-lock.yaml
- What changed: Replaced the only print/PDF export action with actual PDF generation; embedded Roboto, repeated table headers, page numbers, selected filters, notes and deductions. Added busy/error feedback and managed Blob download.
- Behavior tested: PDF generation and independent PDF parsing passed for 100 rows; extracted company, final invoice and rupee values verified across multiple pages. Rendered first page visually inspected: readable table, branding, footer and rupee glyphs.
- Notes / remaining issues: Browser download testing pending. Final audit also converted attachment actions to authenticated Blob downloads with error/busy feedback, avoiding popup blockers.

## Task 6 — Custom searchable dropdowns

- Status: Completed
- Changed files: src/components/ui/select.tsx, all seven audited select consumers, app/workspace.css, scripts/replace-selects.mjs, package.json, pnpm-lock.yaml
- What changed: Shared searchable, portal-positioned dropdown with bounded scrolling, keyboard navigation, selected/disabled/empty states. Hidden native form controls retain required validation and FormData values. Table checkbox multi-selection remains intact.
- Behavior tested: Typecheck passed. Lint found one unsupported button ARIA attribute, which was removed. Source audit finds no visible native select consumers.
- Notes / remaining issues: Browser/screen-reader testing pending.

## Task 7 — Heading alignment

- Status: Completed
- Changed files: src/components/ui/page-header.tsx, workspace/reports/transactions/import-statement components, app/workspace.css, scripts/standardize-headers.mjs
- What changed: Shared header wrapper with consistent responsive action alignment; Categories tabs and helper text separated into evenly spaced rows; modal form/footer spacing normalized.
- Behavior tested: Typecheck passed; reviewed nested header/action structure. Lint running with final checks.
- Notes / remaining issues: Visual viewport checks pending.

## Task 8 — Delete individual imported transactions

- Status: Completed
- Changed files: supabase/migrations/202611120012_delete_transaction.sql, supabase/setup.sql, src/features/transactions.tsx, src/lib/database.test.ts
- What changed: Per-row confirmation and guarded RPC; owner/accountant only; blocks allocations, categories, other income and attachments. Direct authenticated DELETE blocked. Existing audit trigger records prior row. All query caches refreshed.
- Behavior tested: 7 database tests passed, including unauthorized RPC/direct-delete blocking, linked-row rejection, unchanged balances, sibling preservation, audit entry and repeated-delete error. Typecheck passed.
- Notes / remaining issues: Migration 202611120012 must be applied to the existing Supabase database; do NOT rerun fresh setup.sql on existing data.

## Task 9 — Searchable receipt allocation

- Status: Completed
- Changed files: src/features/classify-dialog.tsx, src/lib/allocation.ts, src/lib/invoice-calc.test.ts
- What changed: Add-invoice combobox with number/company/date/available amount; explicit allocation rows with remove action; existing allocations hydrate automatically, duplicate selections excluded. Tenant-scoped invoice pages loaded fully. Other income and unassigned remainder retained. Currency precision above 2 decimals rejected.
- Behavior tested: 6 financial tests passed, including split allocations, precision/nonfinite/negative/duplicate rejection. Typecheck passed before paginated-query refinement; final typecheck covers refinement.
- Notes / remaining issues: Receipt attachments stay removed as previously requested. Browser connection rechecked: no available browsers/native pipe.

## Task 10 — Stable side navigation

- Status: Completed
- Changed files: src/features/workspace.tsx, app/workspace.css
- What changed: Viewport-height desktop shell with independently scrolling main content; compact sidebar spacing, all navigation and bottom actions retained, overflow fallback below 650px height. Mobile navigation now uses a Radix dialog drawer with links, settings, sign-out and close/focus behavior.
- Behavior tested: Typecheck passed; checked CSS cascade and corrected drawer positioning specificity. Final lint/build pending.
- Notes / remaining issues: Browser is unavailable, so viewport/focus interaction verification remains pending.

## Final verification

- Lint: Not yet run
- Typecheck: Not yet run
- Tests: Not yet run
- Production build: Not yet run
- Manual testing: Browser connection was unavailable earlier; recheck before visual QA.
- Known issues: Pending audit.
