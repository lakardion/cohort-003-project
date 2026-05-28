import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles per-user course star ratings (1–5) and average-rating summaries.
// Each user has at most one rating per course; re-rating overwrites it.
// Uses positional parameters (project convention).

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function getUserRatingForCourse(userId: number, courseId: number) {
  return db
    .select()
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();
}

export type CourseRatingSummary = {
  average: number;
  count: number;
};

export function getCourseRatingSummary(courseId: number): CourseRatingSummary {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: result?.average ?? 0,
    count: result?.count ?? 0,
  };
}

/**
 * Inserts or updates the current user's rating for a course.
 * Throws if the rating is not an integer between MIN_RATING and MAX_RATING.
 */
export function rateCourse(userId: number, courseId: number, rating: number) {
  if (
    !Number.isInteger(rating) ||
    rating < MIN_RATING ||
    rating > MAX_RATING
  ) {
    throw new Error(
      `Rating must be an integer between ${MIN_RATING} and ${MAX_RATING}`
    );
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: new Date().toISOString() },
    })
    .returning()
    .get();
}
