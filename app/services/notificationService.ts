import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { notifications, courses, NotificationType } from "~/db/schema";

// ─── Notification Service ───
// Durable in-app notifications addressed to a recipient (e.g. a course's
// instructor). Currently only enrollment notifications exist; the `type`
// column leaves room for future event types.
// Uses positional parameters (project convention).

interface EnrollmentLike {
  id: number;
  userId: number;
  courseId: number;
}

// Creates an enrollment notification addressed to the course's instructor.
// Best-effort: returns null (rather than throwing) when the course can't be
// resolved, so callers on the enrollment critical path are never blocked.
export function notifyEnrollment(enrollment: EnrollmentLike) {
  const course = db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, enrollment.courseId))
    .get();

  if (!course) {
    return null;
  }

  return db
    .insert(notifications)
    .values({
      userId: course.instructorId,
      type: NotificationType.Enrollment,
      courseId: enrollment.courseId,
      actorUserId: enrollment.userId,
      enrollmentId: enrollment.id,
    })
    .returning()
    .get();
}

export function getUnreadCountForUser(userId: number) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();

  return result?.count ?? 0;
}
