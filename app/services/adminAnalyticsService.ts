import { eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, enrollments, purchases } from "~/db/schema";

// ─── Admin Analytics Service ───
// Aggregates platform-wide revenue and enrollment metrics for the admin
// dashboard. Mirrors instructorAnalyticsService in shape and conventions:
// plain exported functions, positional parameters, and the mockable Drizzle
// `db` for every query (the primary testing seam).
//
// Unlike the instructor service, queries are NOT scoped to an owner by
// default. Each function accepts an optional `instructorId` filter: when
// absent it aggregates across the entire platform; when present it scopes to
// that one instructor's courses.
//
// Metric conventions follow the instructor service exactly:
// - Revenue is SUM(purchases.pricePaid) in integer cents (already PPP-adjusted).
// - Rates are percentages 0–100; 0 when the denominator is 0 (no divide-by-zero).

export interface PlatformAnalyticsSummary {
  totalEnrollments: number;
  completedEnrollments: number;
  /** Percentage 0–100; 0 when there are no enrollments. */
  completionRate: number;
  /** Sum of `pricePaid` across the relevant courses, in integer cents. */
  totalRevenue: number;
  /** Number of courses counted toward the summary. */
  courseCount: number;
}

/**
 * Course ids in scope: every course on the platform, or just the given
 * instructor's courses when `instructorId` is supplied. Returns [] when there
 * are no matching courses.
 */
function getScopedCourseIds(instructorId?: number): number[] {
  const query = db.select({ id: courses.id }).from(courses);

  const rows =
    instructorId === undefined
      ? query.all()
      : query.where(eq(courses.instructorId, instructorId)).all();

  return rows.map((c) => c.id);
}

/**
 * Platform-wide totals across all instructors and courses, or scoped to a
 * single instructor when `instructorId` is supplied. Returns a well-formed
 * zeroed summary when there are no matching courses.
 */
export function getPlatformAnalyticsSummary(
  instructorId?: number
): PlatformAnalyticsSummary {
  const courseIds = getScopedCourseIds(instructorId);

  if (courseIds.length === 0) {
    return {
      totalEnrollments: 0,
      completedEnrollments: 0,
      completionRate: 0,
      totalRevenue: 0,
      courseCount: 0,
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

  const totalEnrollments = enrollmentStats?.total ?? 0;
  const completedEnrollments = enrollmentStats?.completed ?? 0;
  const totalRevenue = revenueStats?.total ?? 0;

  return {
    totalEnrollments,
    completedEnrollments,
    completionRate:
      totalEnrollments > 0
        ? (completedEnrollments / totalEnrollments) * 100
        : 0,
    totalRevenue,
    courseCount: courseIds.length,
  };
}

export interface RevenueBucket {
  /** Day bucket as an ISO date string (YYYY-MM-DD). */
  date: string;
  /** Sum of `pricePaid` for the bucket, in integer cents. */
  revenue: number;
}

/**
 * Revenue (summed `pricePaid`, in cents) bucketed by day across the entire
 * platform, or scoped to a single instructor's courses when `instructorId` is
 * supplied. Ordered chronologically. Returns an empty array when there are no
 * matching courses or no purchases.
 */
export function getPlatformRevenueOverTime(
  instructorId?: number
): RevenueBucket[] {
  const courseIds = getScopedCourseIds(instructorId);
  if (courseIds.length === 0) return [];

  const day = sql<string>`substr(${purchases.createdAt}, 1, 10)`;

  return db
    .select({
      date: day,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(inArray(purchases.courseId, courseIds))
    .groupBy(day)
    .orderBy(day)
    .all();
}
