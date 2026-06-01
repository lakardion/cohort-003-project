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
// Aggregation seam for the instructor analytics dashboard. Plain exported
// functions, positional params, Drizzle `db` for all queries (the testing seam).
//
// All metrics are scoped to the courses a given instructor owns. Quiz
// aggregation is computed here over `quizzes` / `quizAttempts` rather than
// reusing `quizScoringService` (which uses a raw connection that bypasses the
// `~/db` mock). Prefer aggregate SQL over per-course N+1 loops.

export type InstructorAnalyticsSummary = {
  /** Total enrollment rows across all owned courses. */
  totalEnrollments: number;
  /** Enrollments with a non-null `completedAt`. */
  completedEnrollments: number;
  /** completedEnrollments ÷ totalEnrollments as a percentage; 0 when no enrollments. */
  completionRate: number;
  /** SUM(purchases.pricePaid) across owned courses, in integer cents. */
  totalRevenue: number;
  /** Mean of quizAttempts.score (all attempts) as a percentage; 0 when no attempts. */
  averageQuizScore: number;
  /** Attempts with passed = true ÷ total attempts as a percentage; 0 when no attempts. */
  passRate: number;
  /** Total quiz attempts backing the average. */
  attemptCount: number;
  /** Distinct quizzes that have at least one attempt. */
  quizCount: number;
};

const EMPTY_SUMMARY: InstructorAnalyticsSummary = {
  totalEnrollments: 0,
  completedEnrollments: 0,
  completionRate: 0,
  totalRevenue: 0,
  averageQuizScore: 0,
  passRate: 0,
  attemptCount: 0,
  quizCount: 0,
};

/** Round a percentage to two decimals to avoid floating-point noise. */
function asPercent(ratio: number): number {
  return Math.round(ratio * 100 * 100) / 100;
}

/**
 * Portfolio-level totals across every course owned by `instructorId`.
 * Returns a well-formed zeroed summary when the instructor owns no courses.
 */
export function getInstructorAnalyticsSummary(
  instructorId: number
): InstructorAnalyticsSummary {
  const ownedCourseIds = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all()
    .map((row) => row.id);

  if (ownedCourseIds.length === 0) {
    return { ...EMPTY_SUMMARY };
  }

  const enrollmentAgg = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${enrollments.completedAt} is not null then 1 else 0 end)`,
    })
    .from(enrollments)
    .where(inArray(enrollments.courseId, ownedCourseIds))
    .get();

  const revenueAgg = db
    .select({ total: sql<number | null>`sum(${purchases.pricePaid})` })
    .from(purchases)
    .where(inArray(purchases.courseId, ownedCourseIds))
    .get();

  // Attempts on quizzes whose lesson lives in a module of an owned course.
  const quizAgg = db
    .select({
      avgScore: sql<number | null>`avg(${quizAttempts.score})`,
      attempts: sql<number>`count(*)`,
      passed: sql<number>`sum(case when ${quizAttempts.passed} then 1 else 0 end)`,
      distinctQuizzes: sql<number>`count(distinct ${quizAttempts.quizId})`,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, ownedCourseIds))
    .get();

  const totalEnrollments = enrollmentAgg?.total ?? 0;
  const completedEnrollments = enrollmentAgg?.completed ?? 0;
  const totalRevenue = revenueAgg?.total ?? 0;
  const attemptCount = quizAgg?.attempts ?? 0;
  const passedAttempts = quizAgg?.passed ?? 0;
  const avgScore = quizAgg?.avgScore ?? null;

  return {
    totalEnrollments,
    completedEnrollments,
    completionRate:
      totalEnrollments > 0
        ? asPercent(completedEnrollments / totalEnrollments)
        : 0,
    totalRevenue,
    averageQuizScore: avgScore !== null ? asPercent(avgScore) : 0,
    passRate: attemptCount > 0 ? asPercent(passedAttempts / attemptCount) : 0,
    attemptCount,
    quizCount: quizAgg?.distinctQuizzes ?? 0,
  };
}
