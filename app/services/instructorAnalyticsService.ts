import { eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  quizzes,
  quizAttempts,
  lessons,
  modules,
} from "~/db/schema";

// ─── Instructor Analytics Service ───
// Aggregates cross-course performance metrics for an instructor's dashboard.
// Plain exported functions, positional parameters, the mockable Drizzle `db`
// for every query (the primary testing seam). All metrics are scoped to the
// courses the given instructor owns.
//
// Quiz aggregation is computed here over the `quizzes` / `quizAttempts` tables
// (joined through lessons → modules → courses) rather than reusing
// quizScoringService, which talks to a raw, unmockable `data.db` connection.
//
// Metric conventions:
// - Revenue is SUM(purchases.pricePaid) in integer cents (already PPP-adjusted).
// - Rates (completion, pass) are percentages 0–100; 0 when the denominator is 0
//   (no divide-by-zero).
// - Average quiz score is the mean of ALL `quizAttempts.score` (scores are
//   stored 0–1 reals) expressed as a percentage (×100) — not best-per-user.

export interface InstructorAnalyticsSummary {
  totalEnrollments: number;
  completedEnrollments: number;
  /** Percentage 0–100; 0 when there are no enrollments. */
  completionRate: number;
  /** Sum of `pricePaid` across owned courses, in integer cents. */
  totalRevenue: number;
  /** Mean of all quiz attempt scores as a percentage 0–100; 0 with no attempts. */
  averageQuizScore: number;
  /** Percentage 0–100 of attempts that passed; 0 when there are no attempts. */
  passRate: number;
  /** Total number of quiz attempts backing the average. */
  attemptCount: number;
  /** Number of distinct quizzes that have at least one attempt. */
  distinctQuizCount: number;
}

/** Course ids owned by the instructor. Returns [] when they own none. */
function getOwnedCourseIds(instructorId: number): number[] {
  return db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all()
    .map((c) => c.id);
}

/**
 * Portfolio-level totals across all of the instructor's courses.
 * Returns a well-formed zeroed summary when the instructor owns no courses.
 */
export function getInstructorAnalyticsSummary(
  instructorId: number
): InstructorAnalyticsSummary {
  const courseIds = getOwnedCourseIds(instructorId);

  if (courseIds.length === 0) {
    return {
      totalEnrollments: 0,
      completedEnrollments: 0,
      completionRate: 0,
      totalRevenue: 0,
      averageQuizScore: 0,
      passRate: 0,
      attemptCount: 0,
      distinctQuizCount: 0,
    };
  }

  const enrollmentStats = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${enrollments.completedAt} is not null then 1 else 0 end)`,
    })
    .from(enrollments)
    .where(inArray(enrollments.courseId, courseIds))
    .get();

  const revenueStats = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(inArray(purchases.courseId, courseIds))
    .get();

  const quizStats = db
    .select({
      avgScore: sql<number | null>`avg(${quizAttempts.score})`,
      attemptCount: sql<number>`count(*)`,
      passedCount: sql<number>`sum(case when ${quizAttempts.passed} then 1 else 0 end)`,
      distinctQuizzes: sql<number>`count(distinct ${quizAttempts.quizId})`,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .get();

  const totalEnrollments = enrollmentStats?.total ?? 0;
  const completedEnrollments = enrollmentStats?.completed ?? 0;
  const totalRevenue = revenueStats?.total ?? 0;

  const attemptCount = quizStats?.attemptCount ?? 0;
  const passedCount = quizStats?.passedCount ?? 0;
  const distinctQuizCount = quizStats?.distinctQuizzes ?? 0;
  const avgScore = quizStats?.avgScore ?? null;

  return {
    totalEnrollments,
    completedEnrollments,
    completionRate:
      totalEnrollments > 0
        ? (completedEnrollments / totalEnrollments) * 100
        : 0,
    totalRevenue,
    averageQuizScore: avgScore !== null ? avgScore * 100 : 0,
    passRate: attemptCount > 0 ? (passedCount / attemptCount) * 100 : 0,
    attemptCount,
    distinctQuizCount,
  };
}
