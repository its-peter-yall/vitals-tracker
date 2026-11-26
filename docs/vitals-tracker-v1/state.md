---
objective: vitals-tracker-v1
workflow: maw
state_schema_version: 2
status: in-progress
skipped_phases: [review]
source: conversation (brainstorming session 2026-11-26)
goal_status: approved
dag_status: research-reconciled
resume_gate: authorized
delegation:
  harness: opencode
  capability_matrix_row: "OpenCode | subagent | The model argument as provider/model, optionally with a variant suffix; a Markdown agent may also pin model in ~/.config/opencode/agents/<name>.md or .opencode/agents/<name>.md | The #variant suffix on the model value, or the tool's variant argument | Exact provider/model ID plus a variant | Low; re-check that the catalog entry still advertises the chosen variant"
  model_selection: supported
  effort_control: supported
  setup_status: complete
  enforcement: verified
  roles:
    researcher: { mode: automatic, model: "xai/grok-4.6#xhigh", effort: "xhigh", model_scope: id }
    planner: { mode: automatic, model: "openai/gpt-6.2-sol#xhigh", effort: "xhigh", model_scope: id }
    worker: { mode: harness-default, model: null, effort: null, model_scope: id }
  plan_overrides:
    planner:
      P7: { mode: manual, model: null, effort: null, scope: "frontend" }
      P8: { mode: manual, model: null, effort: null, scope: "frontend" }
---

# State & Dependency Graph: Vitals & Nutrient Care Tracker (`vitals-tracker-v1`)

## Workflow configuration

- Workflow type: **MAW** (`workflow: maw`, pipelined multi-agent DAG execution).
- Keep all workflow artifacts directly in `docs/vitals-tracker-v1/`.
- Create no unnecessary directories; reuse standard Next.js App Router (`src/`) and `tests/` directories.
- Skipped phases declared: `--skip review` (Step 5 Unified Code Review is bypassed per user request).
- Mandatory phases: Brainstorming, planning, worker execution, and final verification remain required.
- Current authorization: **RESUMED** via `/resume` on 2026-11-26; goal and initial DAG accepted. Role preflight and Step 2 research are complete; P1 planning is ready.
- File preservation rules: Keep `.env.local` (if created by the user for Turso/OpenRouter secrets) strictly untracked in `.gitignore`; never commit API keys or local SQLite database files.

## Delegation configuration & handoffs

- Harness: **OpenCode** (`subagent` delegation tool with `agent: explore | general` and an optional `model` as `provider/model[#variant]`; capability matrix row: OpenCode — exact provider/model ID plus a variant).
- Capability evidence: The exposed `subagent` schema accepts `model` (`providerID/modelID` or `providerID/modelID#variant`) and `agent`. `opencode models` enumerates the live provider/model catalog; model metadata in `~/.cache/opencode/models.json` advertises reasoning options where available. There is no separate effort parameter; effort is encoded as the optional `#variant` suffix. Antigravity's `invoke_subagent` is not available in this session, so the persisted Antigravity tier plan was replaced.
- Selection order: Researcher → Planner → Worker.
  - **Researcher:** `xai/grok-4.6#xhigh` (vendor-native Grok 4.6 with extra-high reasoning; Grok 4.6 advertises `low | medium | high | xhigh`).
  - **Planner:** `openai/gpt-6.2-sol#xhigh` for backend/foundation plans P1–P6 and P9. The user explicitly split planning by frontend/backend and chose a **manual handoff** for the frontend planner on P7 and P8; no frontend planner subagent will be spawned, and those prompts are emitted only when P7/P8 planning prerequisites are met.
  - **Worker:** `harness-default` for both backend/foundation (P1–P6, P9) and frontend (P7–P8); no model override is passed.
  - The earlier harness-default entry was a mistake caused by treating the user's selection as a duplicate prompt answer; it has been corrected.
- Enforcement: **verified** for the researcher. The child session `ses_de9059acfffeuf1f38zpstQ1Y7` recorded `{"id":"grok-4.6","providerID":"xai","variant":"xhigh"}` in the OpenCode session database. Planner and worker dispatches still need their own enforcement checks.
- Reviewer/fixer: Skipped (`--skip review`); not part of role selection.

| Handoff ID | Role | Plan/phase scope | Prompt reference | Expected artifacts | Status | Returned evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |

*(No manual handoffs issued yet. The frontend planner for P7/P8 is configured as a manual handoff, but its prerequisites (P4/P5/P6 plans or workers) are not yet met; the copyable prompt will be recorded here when ready. Pending handoffs block their dependents, not independent work.)*

## Workflow milestones

- [x] Step 1: Brainstorming & Goal Alignment (`docs/vitals-tracker-v1/goal.md`; `c09da44`)
- [x] Step 2: Technical Research (`docs/vitals-tracker-v1/research.md`; `c201c69`)
- [ ] Step 3: Planning Completed (all plans `plan1.md`–`plan9.md` written and committed)
- [ ] Step 4: Execution Completed (all workers `P1`–`P9` finished and verified)
- [x] Step 5: Unified Code Review (Skipped via `--skip review`)
- [ ] Step 6: Final Verification & Report (`docs/vitals-tracker-v1/final_report.md`)

## Brainstorming tasks

- [x] Explore project context: verified empty greenfield workspace, initialized git on `main`, checked Node `v24.18.0` and npm `12.0.1`.
- [x] Clarify requirements, edge cases, scope boundaries, medical safety, and platform.
- [x] Compare 3 architectural approaches and confirm recommended stack + Phase 1 scope.
- [x] Present design in 4 validated sections and incorporate user refinements.
- [x] Write and commit the validated `goal.md`: `c09da44`.
- [x] Self-check specification for completeness, consistency, ambiguity, and scope.
- [x] Construct the complete pre-research MAW DAG, disjoint file ownership, dependencies, exit gates, acceptance mapping, and resume procedure below.
- [x] Final user review of written `goal.md` and `state.md` + explicit resume authorization (`/resume`, 2026-11-26).

## Initial findings

- Greenfield project at `d:/Peter/Personal Stuffs/vitals-tracker`; git repository initialized on branch `main` with root commit `c09da44` (`docs/vitals-tracker-v1/goal.md`).
- Local runtime available: Node `v24.18.0`, npm `12.0.1`, Windows PowerShell 5.1 shell (commands should avoid bash-only `&&` chaining when executed in PowerShell).
- Production database target is **Turso** (hosted libSQL/SQLite free tier), making **Drizzle ORM + `@libsql/client`** superior to Prisma adapters for zero-friction local SQLite (`file:local.db`) ↔ Turso (`libsql://`) parity.
- Vision AI will run through the user's **OpenRouter API key** with a user-selectable vision model stored server-side/settings, plus an optional pluggable OCR fallback (`tesseract.js`).

## Confirmed product decisions

- **Primary persona:** Built for the user's mother (new to technology) and family caregivers—large readable typography (18px+ base), generous tap targets, forgiving Undo, zero technical jargon.
- **Custom trackers:** Users create multiple trackers via a guided step-by-step wizard (Name & optional Health Focus → Vitamins → Minerals → Essential Nutrients); each tracker shows only its selected nutrients.
- **Food logging:** Quantity in `g` or `ml` (with quick-tap presets) backed by a hybrid waterfall (saved/recent → curated regional & global local staples with aliases → open food API → OpenRouter AI estimation labeled *Estimated*), auto-caching confirmed foods.
- **Medicines & supplements:** Supports both supplements (contributing directly to daily vitamin/mineral totals) and prescription medicines (dose, schedule, plain-language food/nutrient notes). Scanning uses OpenRouter Vision AI primary + optional OCR fallback with mandatory 1-tap Confirm Card.
- **Repetitive medicines ("My Medicines"):** Any scanned or logged medicine is saved for 1-tap repeat logging on future days with zero repeated photo scans or API calls.
- **Safe condition-aware impact alerts:** Vital nutrients first, paired with deterministic directional nutritional cautions (e.g., high sugar for diabetes, high sodium for high BP)—never fabricating clinical mg/dL or mmHg numbers.
- **Visual design & Analytics:** Modern, minimalistic **dual-chromatic** color palette with **Light & Dark mode**, plus a per-tracker **Analytics** page (`7d` / `30d` trends, Needs Attention vs. On Track, caution days, medicine consistency).
- **Platform & accounts:** Mobile-first PWA with lightweight accounts + persistent `HttpOnly` sessions so family members can help configure trackers remotely while the OpenRouter key stays safely server-side.
- **Workflow choice:** Convert into **MAW** workflow with `--skip review`, and pause right after committing `goal.md` and `state.md`.

## Dependency matrix & execution status

This is the pre-research DAG (`dag_status: initial`). After user review, role model selection preflight, and Step 2 Technical Research (`R`), the DAG will be reconciled (`dag_status: research-reconciled`) if research uncovers any package/API adjustments. All parallelizable plans (`P2`‖`P3`, `P4`‖`P5`‖`P6`, and `P7`‖`P8`) have **strictly disjoint file ownership**; `P1` installs all planned npm dependencies upfront in `package.json` so downstream parallel workers never contend on `package.json` or lockfiles.

`R` means technical research completed and committed. `P#` worker dependencies mean prerequisite implementation is completed, verified, and committed. Planner dependencies are separately defined so planning and ready workers can overlap.

| Plan ID | Title & Scope | Worker dependencies | Touched files / subsystems | Planner status | Worker status | Commits |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P1** | Project Scaffold, Drizzle/Turso Schema, OpenRouter Client & Dual-Chromatic Theme Foundation | R | `package.json`, `next.config.*`, `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`, `.env.example`, `.gitignore`, `public/manifest.json`, `public/sw.js`, `public/icons/*`, `src/db/index.ts`, `src/db/schema.ts`, `src/db/test-utils.ts`, `src/lib/openrouter/*`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/theme-provider.tsx`, `src/components/ui/*`, `tests/db-schema.test.ts` | [ ] Pending | [ ] Pending | - |
| **P2** | Lightweight Auth, Persistent Sessions & User Settings | P1 | `src/lib/auth/*`, `src/app/api/auth/**`, `src/app/api/settings/route.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/settings/page.tsx`, `tests/auth.test.ts` | [ ] Pending | [ ] Pending | - |
| **P3** | Canonical Nutrient Catalog, Scaling Math & Condition Impact Engine | P1 | `src/lib/nutrients/*`, `src/lib/impact/*`, `tests/nutrients.test.ts`, `tests/impact-engine.test.ts` | [ ] Pending | [ ] Pending | - |
| **P4** | Curated Food Catalog & Hybrid Food Resolver API | P2, P3 | `src/db/seed-foods.ts`, `src/lib/foods/*`, `src/app/api/foods/**`, `tests/food-resolver.test.ts` | [ ] Pending | [ ] Pending | - |
| **P5** | Curated Medicines, OpenRouter Vision Scanner, OCR Fallback & "My Medicines" API | P2, P3 | `src/db/seed-medicines.ts`, `src/lib/medicines/*`, `src/app/api/medicines/**`, `tests/medicine-recognizer.test.ts`, `tests/medicines-api.test.ts` | [ ] Pending | [ ] Pending | - |
| **P6** | Trackers CRUD, Intake Logs, Daily Summary & Analytics API | P2, P3 | `src/lib/trackers/*`, `src/lib/analytics/*`, `src/app/api/trackers/**`, `tests/trackers-api.test.ts`, `tests/analytics.test.ts` | [ ] Pending | [ ] Pending | - |
| **P7** | Trackers Home, Guided Wizard, Daily View, Food/Medicine Logging & Confirm Card UI | P4, P5, P6 | `src/app/page.tsx`, `src/app/trackers/new/page.tsx`, `src/app/trackers/[id]/layout.tsx`, `src/app/trackers/[id]/page.tsx`, `src/components/wizard/*`, `src/components/trackers/*`, `src/components/logging/*`, `tests/tracker-ui.test.tsx` | [ ] Pending | [ ] Pending | - |
| **P8** | Per-Tracker Analytics Page UI (`7d` / `30d` Dual-Chromatic Charts & Insights) | P6 | `src/app/trackers/[id]/analytics/page.tsx`, `src/components/analytics/*`, `tests/analytics-ui.test.tsx` | [ ] Pending | [ ] Pending | - |
| **P9** | Unified Seed Runner, E2E Integration Tests, Setup Docs & Full Verification | P7, P8 | `src/db/seed.ts`, `tests/e2e-flows.test.ts`, `README.md` | [ ] Pending | [ ] Pending | - |

*(Note on statuses: Planner status updates to `[x] <hash>` once the planner commits; Worker status updates to `[x] Complete` once the worker finishes and tests pass).*

### Execution graph

```mermaid
flowchart TD
    G[Goal approved and DAG complete] --> H[User review, role selection, and resume]
    H --> R[R: Technical research]
    R --> P1[P1: Scaffold, Drizzle/Turso Schema, OpenRouter Client & Theme]
    P1 --> P2[P2: Auth, Sessions & Settings]
    P1 --> P3[P3: Nutrient Catalog, Scaling Math & Impact Engine]
    P2 --> P4[P4: Foods Seed & Hybrid Resolver API]
    P3 --> P4
    P2 --> P5[P5: Medicines Seed, Vision/OCR Scanner & My Medicines API]
    P3 --> P5
    P2 --> P6[P6: Trackers, Intake Logs, Summary & Analytics API]
    P3 --> P6
    P4 --> P7[P7: Wizard, Daily Home & Food/Medicine Logging UI]
    P5 --> P7
    P6 --> P7
    P6 --> P8[P8: Per-Tracker Analytics Page UI]
    P7 --> P9[P9: Unified Seed, E2E Integration & Verification]
    P8 --> P9
    P9 --> V[Final verification and final_report.md - review skipped]
```

### Planner readiness and immediate worker dispatch

| Planner | Earliest planning prerequisites after resume | Worker start condition |
| :--- | :--- | :--- |
| **P1** | R committed | P1 plan committed |
| **P2** | P1 worker committed | P2 plan committed and P1 complete |
| **P3** | P1 worker committed | P3 plan committed and P1 complete |
| **P4** | P2 and P3 workers committed | P4 plan committed; P2 and P3 complete |
| **P5** | P2 and P3 workers committed | P5 plan committed; P2 and P3 complete |
| **P6** | P2 and P3 workers committed | P6 plan committed; P2 and P3 complete |
| **P7** | P4, P5, and P6 plans committed (or workers complete) | P7 plan committed; P4, P5, and P6 workers complete |
| **P8** | P6 plan committed (or worker complete) | P8 plan committed; P6 worker complete |
| **P9** | P7 and P8 plans committed | P9 plan committed; P7 and P8 workers complete |

- Dispatch independent planners concurrently in foreground parallel (`P2`‖`P3`, `P4`‖`P5`‖`P6`, `P7`‖`P8`).
- Start each ready worker immediately when its plan is committed and worker prerequisites are met; do not wait for unrelated planners.
- Workers with disjoint write ownership execute in parallel (`P2`‖`P3`, `P4`‖`P5`‖`P6`, `P7`‖`P8`).
- Serialize git staging/commits, even for disjoint workers, to avoid shared-index collisions.
- A changed upstream contract pauses affected downstream work until plans/types are reconciled.

## Plan scopes, file ownership, and completion gates

### P1 — Project Scaffold, Drizzle/Turso Schema, OpenRouter Client & Dual-Chromatic Theme Foundation
**Deliverable:** `plan1.md`; runnable Next.js TypeScript PWA foundation, complete Drizzle/libSQL schema (local SQLite + Turso), shared server OpenRouter HTTP client, and dual-chromatic Light/Dark design tokens.  
**Owned files:**
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`, `drizzle.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.env.example`, `.gitignore`
- `public/manifest.json`, `public/sw.js`, `public/icons/*`
- `src/db/index.ts`, `src/db/schema.ts`, `src/db/test-utils.ts`
- `src/lib/env.ts`, `src/lib/openrouter/client.ts`, `src/lib/openrouter/models.ts`
- `src/app/layout.tsx`, `src/app/globals.css`, `src/components/theme-provider.tsx`, `src/components/ui/*`
- `tests/db-schema.test.ts`  
**Scope:** Bootstrap Next.js App Router + Tailwind + Vitest + all planned dependencies (`drizzle-orm`, `drizzle-kit`, `@libsql/client`, `zod`, `recharts`, `lucide-react`, `tesseract.js`, `@testing-library/react`, `jsdom`) so parallel downstream plans never touch `package.json`. **Research-reconciled pins:** Next `16.4.6`, React/React DOM `19.3.1`, TypeScript `7.0.2`, Tailwind `4.3.5`, Zod `4.6.7`, Drizzle ORM `0.45.4`, drizzle-kit `0.31.11`, `@libsql/client` `0.18.0`, Vitest `5.1.2`, ESLint `9.39.5`, `@types/node@24`; Node `>=24.15`; do not use Drizzle v1 RC or `@tursodatabase/*`. `create-next-app` refuses this non-empty repo, so scaffold the files manually. Set `serverExternalPackages: ['@libsql/client', 'libsql', 'tesseract.js']` and use the Node.js runtime. Implement all 7 Drizzle tables, libSQL connection helper (local `file:local.db` + Turso `libsql://`), in-memory test DB harness, server-only OpenRouter client (20s timeout, model allow-list, structured JSON extraction), PWA manifest/service worker registration, and dual-chromatic Light/Dark theme shell (`18px` base typography, `UndoToast`, accessible button/card primitives).  
**Exit gate:** `npm run typecheck`, `npm run build`, and `npx vitest run tests/db-schema.test.ts` pass, proving all 7 tables migrate and round-trip cleanly in in-memory libSQL.

### P2 — Lightweight Auth, Persistent Sessions & User Settings
**Deliverable:** `plan2.md`; secure `scrypt` auth, persistent 90-day `HttpOnly` sessions, `requireUser()` guard, login/signup UI, and Settings page (theme + OpenRouter vision model picker + medical safety notice).  
**Owned files:**
- `src/lib/auth/password.ts`, `src/lib/auth/session.ts`, `src/lib/auth/schemas.ts`
- `src/app/api/auth/signup/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/auth/me/route.ts`
- `src/app/api/settings/route.ts`
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/settings/page.tsx`
- `tests/auth.test.ts`  
**Scope:** Implement account registration/login/logout with salted `scrypt` password hashes and hashed session tokens in `sessions`, long-lived `HttpOnly` / `SameSite=Lax` cookies, strict `requireUser()` helper returning `401` for unauthenticated requests, and `/settings` UI for Light/Dark/System theme switching, OpenRouter vision model selection (allow-listed vision models + custom model ID), and the plain-language medical disclaimer.  
**Exit gate:** `npx vitest run tests/auth.test.ts` passes, verifying signup, duplicate-email rejection, login/logout, persistent session resolution, unauthorized `401` enforcement, and settings update persistence.

### P3 — Canonical Nutrient Catalog, Scaling Math & Condition Impact Engine
**Deliverable:** `plan3.md`; zero-dependency canonical nutrient catalog, exact `g`/`ml`/dose calculation engine, and deterministic condition-aware directional alert engine.  
**Owned files:**
- `src/lib/nutrients/catalog.ts`, `src/lib/nutrients/calculator.ts`, `src/lib/nutrients/types.ts`
- `src/lib/impact/engine.ts`, `src/lib/impact/types.ts`
- `tests/nutrients.test.ts`, `tests/impact-engine.test.ts`  
**Scope:** Define all selectable Vitamins (A, B1, B2, B3, B6, B9, B12, C, D, E, K), Minerals (Calcium, Iron, Magnesium, Potassium, Sodium, Zinc, Iodine, Selenium, Phosphorus), and Essential Nutrients (Protein, Fiber, Total Sugars, Added Sugars, Carbohydrates, Healthy Fats, Water) with units and default adult targets; implement `g`/`ml` scaling (`1 ml = 1 g` fallback), supplement dose scaling, full-day nutrient aggregation, and `impact-engine` rules evaluating full daily totals for `diabetes` (sugar load) and `hypertension` (sodium load) cautions—strictly directional nutritional messages, never simulated clinical readings.  
**Exit gate:** `npx vitest run tests/nutrients.test.ts tests/impact-engine.test.ts` passes with 100% coverage of scaling edge cases, rounding, combined food + supplement sums, and Diabetes/High-BP threshold boundaries with zero false alarms.

### P4 — Curated Food Catalog & Hybrid Food Resolver API
**Deliverable:** `plan4.md`; curated regional/global staple foods seed module and hybrid waterfall food search/resolve/cache APIs.  
**Owned files:**
- `src/db/seed-foods.ts`
- `src/lib/foods/resolver.ts`, `src/lib/foods/schemas.ts`, `src/lib/foods/open-api.ts`
- `src/app/api/foods/search/route.ts`, `src/app/api/foods/resolve/route.ts`, `src/app/api/foods/route.ts`
- `tests/food-resolver.test.ts`  
**Scope:** Curate ~100+ everyday regional home-cooked & global staple foods with common aliases (e.g., *roti/chapati*, *curd/dahi*, *idli*, *dal*, *milk*, *banana*, *rice*, *egg*, *spinach/palak*) and per-100g/ml profiles. Implement `GET /api/foods/search` (user saved/recent + local alias match), `POST /api/foods/resolve` (open food DB lookup → OpenRouter AI fallback returning *Estimated* draft validated by `zod`), and `POST /api/foods` (save/cache user-confirmed food scoped by `userId`).  
**Exit gate:** `npx vitest run tests/food-resolver.test.ts` passes with mocked external/OpenRouter fixtures, confirming alias matching, waterfall order, Zod rejection of malformed AI payloads, and automatic confirmed-food caching.

### P5 — Curated Medicines, OpenRouter Vision Scanner, OCR Fallback & "My Medicines" API
**Deliverable:** `plan5.md`; pluggable medicine recognizer (`OpenRouterVisionProvider` + `OcrFallbackProvider`), server-side image validation, curated starter supplements/meds, and "My Medicines" cabinet CRUD APIs.  
**Owned files:**
- `src/db/seed-medicines.ts`
- `src/lib/medicines/types.ts`, `src/lib/medicines/schemas.ts`, `src/lib/medicines/openrouter-vision.ts`, `src/lib/medicines/ocr-fallback.ts`, `src/lib/medicines/recognizer.ts`
- `src/app/api/medicines/route.ts`, `src/app/api/medicines/[id]/route.ts`, `src/app/api/medicines/scan/route.ts`
- `tests/medicine-recognizer.test.ts`, `tests/medicines-api.test.ts`  
**Scope:** Implement strict image validation (`image/jpeg`, `image/png`, `image/webp`, ≤ 2 MB, processed strictly in-memory with zero disk writes), OpenRouter Vision structured extraction (brand/generic name, `supplement` | `prescription` | `both`, per-dose vitamin/mineral map, plain-language food/nutrient notes, confidence level), optional Tesseract.js OCR fallback + catalog matching, never auto-logging scan results, and authenticated CRUD for the user's **My Medicines** cabinet (`GET/POST /api/medicines`, `PATCH/DELETE /api/medicines/[id]`).  
**Exit gate:** `npx vitest run tests/medicine-recognizer.test.ts tests/medicines-api.test.ts` passes, verifying MIME/size rejection, valid/partial/low-confidence/malformed OpenRouter fixtures, OCR fallback behavior, and strict user-isolated "My Medicines" CRUD.

### P6 — Trackers CRUD, Intake Logs, Daily Summary & Analytics API
**Deliverable:** `plan6.md`; full tracker lifecycle APIs, local-date intake logging with immutable nutrient snapshots, daily summary with `impact-engine` alerts, and `7d`/`30d` analytics rollups.  
**Owned files:**
- `src/lib/trackers/service.ts`, `src/lib/trackers/schemas.ts`
- `src/lib/analytics/service.ts`, `src/lib/analytics/types.ts`
- `src/app/api/trackers/route.ts`, `src/app/api/trackers/[id]/route.ts`
- `src/app/api/trackers/[id]/logs/route.ts`, `src/app/api/trackers/[id]/logs/[logId]/route.ts`
- `src/app/api/trackers/[id]/summary/route.ts`, `src/app/api/trackers/[id]/analytics/route.ts`
- `tests/trackers-api.test.ts`, `tests/analytics.test.ts`  
**Scope:** Implement tracker creation (selected vitamins/minerals/essential nutrients + targets + health flags), editing/deletion, intake logging (`food` by `g`/`ml` and `medicine` by `dose`, storing full immutable `computedNutrientsJson` and local `logDate`), quantity editing & Undo deletion, daily summary endpoint (filtering progress cards to `tracker_nutrients` while evaluating `impact-engine` across full daily totals), and `7d`/`30d` analytics rollup endpoint (daily series, average completion, Needs Attention vs. On Track, caution days, medicine adherence). Strictly enforce `userId` ownership on every route.  
**Exit gate:** `npx vitest run tests/trackers-api.test.ts tests/analytics.test.ts` passes, verifying cross-user isolation, local-date bucketing, food + supplement aggregation, Undo deletion, condition alert generation, and `7d`/`30d` analytics math.

### P7 — Trackers Home, Guided Wizard, Daily View, Food/Medicine Logging & Confirm Card UI
**Deliverable:** `plan7.md`; complete mother-first mobile/desktop UI for tracker management, 4-step guided wizard, Daily Today screen, food `g`/`ml` logging, medicine photo scan + Confirm Card, and 1-tap "My Medicines" logging.  
**Owned files:**
- `src/app/page.tsx`, `src/app/trackers/new/page.tsx`, `src/app/trackers/[id]/layout.tsx`, `src/app/trackers/[id]/page.tsx`
- `src/components/wizard/*`
- `src/components/trackers/*` (`caution-banner.tsx`, `nutrient-progress-card.tsx`, `daily-log-list.tsx`, `tracker-tabs.tsx`)
- `src/components/logging/*` (`food-log-modal.tsx`, `medicine-log-modal.tsx`, `medicine-confirm-card.tsx`, `image-compress.ts`)
- `tests/tracker-ui.test.tsx`  
**Scope:** Build effortless, minimalistic, dual-chromatic Light/Dark views with ≥48px touch targets: Trackers dashboard (`/`), 4-step Create Tracker Wizard (`/trackers/new`), Tracker layout (`Today` | `Analytics` tabs), Today view (date switcher, Condition Caution Banner, selected-only nutrient cards, Today's Log with edit/delete + 8-second Undo toast), Food modal (recent/search + AI fallback + `g`/`ml` presets + live preview), and Medicine modal (**My Medicines** 1-tap list on top + client-compressed camera/upload scan → **Medicine Confirm Card** with confidence badge, Retake, OCR fallback, and manual entry recovery).  
**Exit gate:** `npx vitest run tests/tracker-ui.test.tsx` and `npm run typecheck` pass, verifying wizard steps, food preview math, Confirm Card explicit confirmation, 1-tap repeat medicine logging, and error recovery states.

### P8 — Per-Tracker Analytics Page UI (`7d` / `30d` Dual-Chromatic Charts & Insights)
**Deliverable:** `plan8.md`; clean, easily digestible per-tracker Analytics page consuming `GET /api/trackers/[id]/analytics`.  
**Owned files:**
- `src/app/trackers/[id]/analytics/page.tsx`
- `src/components/analytics/range-toggle.tsx`, `src/components/analytics/nutrient-trend-chart.tsx`, `src/components/analytics/attention-summary.tsx`, `src/components/analytics/medicine-adherence-card.tsx`, `src/components/analytics/caution-days-strip.tsx`
- `tests/analytics-ui.test.tsx`  
**Scope:** Build `/trackers/[id]/analytics` using the dual-chromatic theme tokens in Light & Dark mode: `7 Days` / `30 Days` toggle, clear summary metrics (average goal completion, active days, caution days), **Needs Attention** vs. **On Track** plain-language cards, interactive nutrient chip selector + Recharts trend chart with target line, caution-day indicators, medicine adherence consistency card, and calm empty-state guidance for brand-new trackers.  
**Exit gate:** `npx vitest run tests/analytics-ui.test.tsx` and `npm run typecheck` pass, verifying empty, normal, and high-caution analytics rendering states.

### P9 — Unified Seed Runner, E2E Integration Tests, Setup Docs & Full Verification
**Deliverable:** `plan9.md`; idempotent local/Turso seed CLI, full cross-plan integration test suite, setup documentation, and final build/lint/test verification.  
**Owned files:**
- `src/db/seed.ts`
- `tests/e2e-flows.test.ts`
- `README.md`  
**Scope:** Wire idempotent `npm run db:seed` combining `seed-foods.ts` and `seed-medicines.ts` (works on both local SQLite and Turso); write end-to-end integration tests covering the complete lifecycle (signup → guided tracker wizard → food `g`/`ml` log → Vision scan & confirm supplement + prescription → 1-tap repeat medicine log → Diabetes & High-BP alert evaluation → `7d`/`30d` analytics → Undo & edit); author `README.md` covering local SQLite setup, Turso env vars, OpenRouter API key & vision model config, and phone home-screen PWA install steps.  
**Exit gate:** `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` all pass with zero errors.

## Acceptance coverage

| Goal criterion | Primary owner(s) | Integrated verification |
| :--- | :--- | :--- |
| **AC1:** Lightweight Auth, Persistent Session & User Isolation | P2 | P6, P9, Final verification |
| **AC2:** Guided Custom Tracker Wizard (Selected Nutrients Only) | P3, P6, P7 | P9, Final verification |
| **AC3:** Food Logging (`g`/`ml`) & Hybrid Resolver + Caching | P3, P4, P7 | P9, Final verification |
| **AC4:** Medicine Photo Scan (OpenRouter Vision + OCR Fallback + Confirm Card) | P1, P5, P7 | P9, Final verification |
| **AC5:** Supplements (Nutrient Totals) & Prescription Meds (Dose + Notes) | P3, P5, P6, P7 | P9, Final verification |
| **AC6:** 1-Tap Repetitive Medicines ("My Medicines" Cabinet) | P5, P7 | P9, Final verification |
| **AC7:** Safe Condition-Aware Impact Alerts (Diabetes / High BP) | P3, P6, P7 | P9, Final verification |
| **AC8:** Local-Date (`YYYY-MM-DD`) Logs, Snapshots, Edit & Undo | P1, P6, P7 | P9, Final verification |
| **AC9:** Per-Tracker Analytics Page (`7d`/`30d` Charts, Needs Attention, Adherence) | P6, P8 | P9, Final verification |
| **AC10:** Modern Minimalistic Dual-Chromatic Light/Dark Accessible PWA | P1, P2, P7, P8 | P9, Final verification |
| **AC11:** Graceful Failure Recovery & Medical Safety Guardrails | P2, P5, P7 | P9, Final verification |
| **AC12:** Turso/SQLite Readiness & Full Automated Verification | P1, P9 | Final verification |

## Research handoff — complete (`c201c69`)

- **Verified stack pins:** Next `16.4.6`, React/React DOM `19.3.1`, TypeScript `7.0.2`, Tailwind `4.3.5`, Zod `4.6.7`, Drizzle ORM `0.45.4`, drizzle-kit `0.31.11`, `@libsql/client` `0.18.0`, Vitest `5.1.2`, ESLint `9.39.5`, `@types/node@24`; Node `>=24.15`. No npm overrides are needed if this matrix is followed. Do not use Drizzle v1 RC or `@tursodatabase/*`.
- **Next.js integration:** `cookies()` and dynamic route `params` are async Promises. Set `serverExternalPackages: ['@libsql/client', 'libsql', 'tesseract.js']`; use the Node.js runtime, not Edge.
- **OpenRouter:** Chat Completions + data-URL vision + `json_schema` structured output; 20s abort. Food waterfall: saved/local → Open Food Facts (User-Agent required, 10–15 requests/min) → USDA FoodData Central (`USDA_FDC_API_KEY`, skipped when unset) → OpenRouter AI estimate.
- **OCR:** keep `tesseract.js@7` in P1 dependencies; implement lazy server-side OCR in P5 and mock it in tests.
- **Scaffold:** `create-next-app` refuses this non-empty repo; P1 must create the Next.js files manually.
- **DAG reconciliation:** execution graph unchanged. P1 ownership expanded with `postcss.config.mjs`, `eslint.config.mjs`, `vitest.setup.ts`, and `src/lib/env.ts`; P1 scope now carries the exact pins above.
- **Blockers:** none.
- **Enforcement:** researcher child session `ses_de9059acfffeuf1f38zpstQ1Y7` ran `xai/grok-4.6` with variant `xhigh` (verified from the OpenCode session record).

## Final verification commands and evidence

| Working directory | Command | Expected purpose |
| :--- | :--- | :--- |
| `d:/Peter/Personal Stuffs/vitals-tracker` | `npm test` | Full Vitest unit and in-memory libSQL integration suite |
| `d:/Peter/Personal Stuffs/vitals-tracker` | `npm run typecheck` | Strict TypeScript type checking across UI, API, and Drizzle schema |
| `d:/Peter/Personal Stuffs/vitals-tracker` | `npm run lint` | ESLint verification across Next.js App Router codebase |
| `d:/Peter/Personal Stuffs/vitals-tracker` | `npm run build` | Production Next.js PWA build verification |

## Artifact and commit record

| Artifact | State | Commit |
| :--- | :--- | :--- |
| `docs/vitals-tracker-v1/goal.md` | Approved | `c09da44` |
| `docs/vitals-tracker-v1/state.md` | Research-reconciled (current update) | `b65964f` + `5b18c8d` + current update |
| `docs/vitals-tracker-v1/research.md` | Complete (`xai/grok-4.6#xhigh` verified) | `c201c69` |
| `docs/vitals-tracker-v1/plan1.md` – `plan9.md` | Pending | - |
| `docs/vitals-tracker-v1/review.md` | Skipped (`--skip review`) | - |
| `docs/vitals-tracker-v1/final_report.md` | Pending | - |

## Current gate and resume procedure

**CURRENT GATE: P1 PLANNING READY — BACKEND PLANNER `openai/gpt-6.2-sol#xhigh`**

Resume steps:
1. [x] Read `docs/vitals-tracker-v1/state.md`, `docs/vitals-tracker-v1/goal.md`, and `git status`; preserve any user edits.
2. [x] Run MAW Section 1.2 sequential role model selection preflight (**Researcher → Planner → Worker**, OpenCode `provider/model[#variant]` IDs or `none`) and persist `setup_status: complete` + `resume_gate: authorized`. Researcher = `xai/grok-4.6#xhigh`; backend planner = `openai/gpt-6.2-sol#xhigh`; frontend planner (P7–P8) = manual handoff; worker = harness-default.
3. [x] Re-dispatch Step 2 Technical Researcher subagent with `xai/grok-4.6#xhigh` (`docs/vitals-tracker-v1/research.md`), reconcile DAG if needed, and update `dag_status: research-reconciled`.
4. [#] Execute MAW pipelined DAG loop (`P1` → `P2`‖`P3` → `P4`‖`P5`‖`P6` → `P7`‖`P8` → `P9`): spawn ready planners in foreground parallel, never read `research.md`/`plan*.md` into orchestrator context, pipeline ready workers immediately, and serialize git commits.
5. [ ] Skip Step 5 Unified Code Review (`--skip review` recorded).
6. [ ] Execute Step 6 Final Verification (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`), write and commit `docs/vitals-tracker-v1/final_report.md`, and set `status: complete`.
