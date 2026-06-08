import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { db } from "~/db";
import { notifications, courses, users, NotificationType } from "~/db/schema";
import { getSeatStatsForTeamCourse } from "./couponService";

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

interface CouponRedemptionNotification {
  recipientUserId: number;
  actorUserId: number;
  courseId: number;
  enrollmentId: number;
  teamId: number;
}

// Creates a coupon-redeemed notification addressed to a team admin. Carries the
// team context so seats-remaining can be computed live at read time. Seats are
// intentionally not stored on the row.
export function notifyCouponRedemption(params: CouponRedemptionNotification) {
  return db
    .insert(notifications)
    .values({
      userId: params.recipientUserId,
      type: NotificationType.CouponRedeemed,
      courseId: params.courseId,
      actorUserId: params.actorUserId,
      enrollmentId: params.enrollmentId,
      teamId: params.teamId,
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

// Recent notifications for a recipient, newest-first, with the display fields
// the UI needs (enrolling student's name, course title). Coupon-redeemed items
// carry a live `seatsRemaining` computed at read time; enrollment items leave
// it null.
export function getNotificationsForUser(userId: number, limit: number) {
  const rows = db
    .select({
      id: notifications.id,
      type: notifications.type,
      courseId: notifications.courseId,
      courseTitle: courses.title,
      actorUserId: notifications.actorUserId,
      actorName: users.name,
      teamId: notifications.teamId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(courses, eq(notifications.courseId, courses.id))
    .innerJoin(users, eq(notifications.actorUserId, users.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
    .all();

  return rows.map(({ teamId, ...row }) => ({
    ...row,
    seatsRemaining:
      row.type === NotificationType.CouponRedeemed && teamId !== null
        ? getSeatStatsForTeamCourse(teamId, row.courseId).remaining
        : null,
  }));
}

// Marks a single notification read, scoped to its recipient so a user cannot
// mutate another user's notifications. Returns the updated row, or undefined
// if it doesn't exist or doesn't belong to the user.
export function markNotificationRead(notificationId: number, userId: number) {
  return db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning()
    .get();
}

// Marks all of a user's unread notifications read. Returns the count affected.
export function markAllRead(userId: number) {
  const updated = db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning()
    .all();

  return updated.length;
}
