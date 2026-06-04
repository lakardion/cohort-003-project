# Multi-Phase Plan — Instructor Analytics Dashboard

> **Source PRD:** [Issue #5 — Instructor Analytics Dashboard](https://github.com/lakardion/cohort-003-project/issues/5)
> **Branch:** `feat/instructor-analytics-dashboard`
> **Status legend:** ☐ not started · ◐ in progress · ☑ done

## Goal

Ship an instructor-facing analytics dashboard at `instructor/analytics` that aggregates
enrollments, revenue, completion rate, and quiz performance across all of the signed-in
instructor's courses, with portfolio summary cards, two time-series charts, and a
per-course breakdown.

## Architecture at a glance

- **Seam:** a new `instructorAnalyticsService.ts` holding all aggregation logic (plain
  functions over Drizzle `db`, positional params) — the single testable seam, mocked via
  `vi.mock("~/db")` exactly like `enrollmentService.test.ts`.
- **Route:** new `instructor/analytics` route whose `loader` calls the service and returns
  a fully-shaped, presentational view-model (mirrors `instructor.$courseId.tsx`).
- **Charts:** `recharts` (already installed, v3.8.1) wrapped in small presentational
  components under `app/components/`.
- **No schema changes.** All metrics derive from existing tables: `courses`, `enrollments`,
  `purchases`, `quizzes`, `quizQuestions`, `quizAttempts`, `lessons`, `modules`.

## The contract (shared view-model)

Locking these shapes up front lets Phase 2 chart work and Phase 3 page work proceed against
a stable interface. Names are indicative; keep them consistent across phases.

```ts
// Time-series point — used by BOTH charts.
type TimeSeriesPoint = { date: string; value: number }; // date = "YYYY-MM-DD"; revenue value in cents

type CoursePerformance = {
  courseId: number;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  enrollments: number;
  revenueCents: number;
  completionRate: number;   // 0–100, integer or 1-dp
  averageQuizScore: number; // 0–100
  quizPassRate: number;     // 0–100
  attemptCount: number;
  quizCount: number;
};

type InstructorAnalyticsSummary = {
  totalEnrollments: number;
  totalRevenueCents: number;
  overallCompletionRate: number;   // 0–100
  overallAverageQuizScore: number; // 0–100
  totalAttempts: number;
  courseCount: number;
};

// Loader return:
type InstructorAnalyticsView = {
  summary: InstructorAnalyticsSummary;
  perCourse: CoursePerformance[];
  enrollmentsOverTime: TimeSeriesPoint[];
  revenueOverTime: TimeSeriesPoint[]; // value in cents
};
```

**Metric definitions (from PRD):**
- *Completion rate* = enrollments with non-null `completedAt` ÷ total enrollments × 100; `0` when no enrollments (no divide-by-zero).
- *Revenue* = `SUM(purchases.pricePaid)` (already PPP-adjusted, integer cents). Format with `formatPrice` from `app/lib/utils.ts`.
- *Average quiz score* = mean of `quizAttempts.score` (stored 0–1) across all quizzes in the course's lessons, ×100. **Default: all attempts** (document in tests).
- *Pass rate* = attempts with `passed = true` ÷ total attempts × 100.
- Ownership: every query filtered by `instructorId`; admins allowed through the same role check.

---

## Phase 0 — Setup ☑ (done)

- ☑ Create branch `feat/instructor-analytics-dashboard`.
- ☑ Install `recharts` (v3.8.1).

**Acceptance:** branch checked out, `recharts` in `package.json`, install clean.

---

## Phase 1 — Aggregation service + tests (FOUNDATION) ☐

**Depends on:** Phase 0. **Blocks:** Phases 2 & 3.

Everything else depends on the service's data shapes, so this lands first and defines the
contract above concretely.

**Build `app/services/instructorAnalyticsService.ts`:**
- `getInstructorAnalyticsSummary(instructorId)` → `InstructorAnalyticsSummary`
- `getPerCourseAnalytics(instructorId)` → `CoursePerformance[]`
- `getEnrollmentsOverTime(instructorId)` → `TimeSeriesPoint[]`
- `getRevenueOverTime(instructorId)` → `TimeSeriesPoint[]` (cents)

Conventions: plain exported functions, positional params, Drizzle `db` only. Prefer
aggregate SQL (`count`/`sum`/`avg`/`group by`) over per-course N+1 loops (PRD story 24).
May reuse `getCoursesByInstructor`, `getEnrollmentCountForCourse`, `getPurchasesByCourse`.

**⚠️ Do NOT call `quizScoringService.getQuizStats` / `getUserQuizHistory`** — they run against
a module-level `new Database("data.db")` raw connection that bypasses the `~/db` mock.
Compute quiz aggregates here via Drizzle `db` over `quizzes`/`quizAttempts`.

**Write `app/services/instructorAnalyticsService.test.ts`:**
Follow `enrollmentService.test.ts` exactly — `vi.mock("~/db")` with a `get db()` getter,
`createTestDb()` + `seedBaseData()` in `beforeEach`, seed extra rows with `testDb.insert(...)`.

Cases: multi-course summary totals; per-course rows correct; ownership scoping (another
instructor's course never appears); completion rate with mixed/zero enrollments; revenue
sum with varied `pricePaid` and zero purchases; quiz average + pass rate with multiple
attempts/quizzes and zero attempts; time-series bucketing across dates and empty series;
instructor with no courses → well-formed empty result (no throw).

**Maps to stories:** 2–9, 14, 16, 17, 18, 20, 21, 24, 28.

**Acceptance:** `pnpm test` green for the new test file; `pnpm typecheck` clean; the four
functions return the contract shapes.

---

## Phase 2 — Presentational pieces (PARALLELIZABLE) ☐

**Depends on:** the *contract* (defined in Phase 1's interface — can start once function
signatures/types exist, before full implementation). **Blocks:** Phase 3.

These two tracks touch disjoint files and can run **in parallel** with each other.

### 2a — Chart components ☐
`app/components/analytics-charts.tsx` (or one file per chart):
- `EnrollmentsOverTimeChart({ data }: { data: TimeSeriesPoint[] })` — recharts line/area.
- `RevenueOverTimeChart({ data }: { data: TimeSeriesPoint[] })` — value in cents; format
  axis/tooltip with `formatPrice`.
- Graceful degradation with 0–1 points (PRD story 26); accessible labels (story 25).

**Maps to stories:** 10, 11, 25, 26.

### 2b — Summary cards + per-course table ☐
Presentational components (or in-page sections) using existing shadcn `Card` and the
established `div`-bar style:
- Summary stat cards (total enrollments, total revenue via `formatPrice`, completion %, avg quiz %).
- Per-course comparison table with status badge (reuse the badge style from `instructor.tsx`)
  and a click-through link to `/instructor/:courseId`.

**Maps to stories:** 2–9, 12, 13, 19, 21.

**Acceptance:** components typecheck and render against mock contract data; no service import
required (pure props).

---

## Phase 3 — Route + integration (SEQUENTIAL) ☐

**Depends on:** Phases 1 (service) and 2 (components).

- `app/routes/instructor.analytics.tsx`:
  - `loader`: `getCurrentUserId` guard → `UserRole.Instructor`/`Admin` check (mirror
    `instructor.$courseId.tsx`); 401/403 via thrown `data(...)`; assemble
    `InstructorAnalyticsView` from the service; return serialisable, pre-formatted data.
  - Default component: summary cards → charts → per-course table; empty state when the
    instructor has no courses (story 15); `ErrorBoundary` following existing pattern.
- Register the route in `app/routes.ts` (inside the `layout.app.tsx` group, near other
  `instructor/*` routes) as `instructor/analytics`. **Place it before `instructor/:courseId`**
  so "analytics" isn't captured as a `:courseId` param.
- Add a nav entry to the dashboard from the instructor area (e.g. a button on
  `instructor.tsx` alongside "New Course").

**Maps to stories:** 1, 13, 14, 15, 23, 27.

**Acceptance:** `/instructor/analytics` renders for an instructor; students/anon get 403/401;
route resolves without shadowing `:courseId`.

---

## Phase 4 — Verification ☐

**Depends on:** Phase 3.

- `pnpm typecheck` clean.
- `pnpm test` green (whole suite, not just the new file).
- `pnpm build` succeeds (catches recharts SSR/bundle issues).
- Manual check in `pnpm dev`: switch to an instructor via DevUI, open `/instructor/analytics`,
  confirm numbers match seeded data, charts render, per-course links work, empty state for an
  instructor with no courses, and a student is denied.

**Acceptance:** all green; dashboard behaves per the user stories.

---

## Dependency & parallelization summary

```
Phase 0 (done)
   │
   ▼
Phase 1  ── service + tests (FOUNDATION, defines contract)
   │
   ├──────────────┬───────────────┐
   ▼              ▼                │   Phase 2a & 2b run in PARALLEL
 Phase 2a       Phase 2b          │   (disjoint files; depend only on the contract)
 charts         cards/table       │
   └──────────────┴───────────────┘
                  │
                  ▼
              Phase 3  ── route + loader + nav + routes.ts (SEQUENTIAL integration)
                  │
                  ▼
              Phase 4  ── typecheck / test / build / manual verify
```

- **Sequential:** Phase 1 before everything; Phase 3 after 1 & 2; Phase 4 last.
- **Parallel:** within Phase 2, the chart track (2a) and the cards/table track (2b) are
  independent. They can also begin against the locked contract while Phase 1's *implementation*
  is still being finished, as long as the function signatures are settled.
- **Shared-file caution:** `app/routes.ts` and the nav edit on `instructor.tsx` are touched
  only in Phase 3 (single track) — keep them out of parallel work to avoid conflicts.

## Out of scope (from PRD)

Real-time analytics, CSV/PDF export, student-facing analytics, `videoWatchEvents`
engagement, custom date-range filtering, refactoring `quizScoringService.ts`'s raw db
connection, coupon/team-seat revenue attribution, and any schema migrations.
