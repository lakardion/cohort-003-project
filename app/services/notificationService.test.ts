import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  notifyEnrollment,
  notifyCouponRedemption,
  getUnreadCountForUser,
  getNotificationsForUser,
  markNotificationRead,
  markAllRead,
} from "./notificationService";

function createEnrollment(userId: number, courseId: number) {
  return testDb
    .insert(schema.enrollments)
    .values({ userId, courseId })
    .returning()
    .get();
}

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("notifyEnrollment", () => {
    it("creates an unread notification addressed to the course's instructor", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);

      const notification = notifyEnrollment(enrollment);

      expect(notification).not.toBeNull();
      expect(notification!.userId).toBe(base.instructor.id);
      expect(notification!.type).toBe(schema.NotificationType.Enrollment);
      expect(notification!.courseId).toBe(base.course.id);
      expect(notification!.actorUserId).toBe(base.user.id);
      expect(notification!.enrollmentId).toBe(enrollment.id);
      expect(notification!.readAt).toBeNull();
    });

    it("returns null when the course cannot be resolved", () => {
      // Fabricate an enrollment-like object pointing at a non-existent course.
      const result = notifyEnrollment({
        id: 1,
        userId: base.user.id,
        courseId: 9999,
      });

      expect(result).toBeNull();
    });
  });

  describe("notifyCouponRedemption", () => {
    it("creates a CouponRedeemed notification addressed to the recipient with team context", () => {
      const team = testDb.insert(schema.teams).values({}).returning().get();
      const enrollment = createEnrollment(base.user.id, base.course.id);

      const notification = notifyCouponRedemption({
        recipientUserId: base.instructor.id,
        actorUserId: base.user.id,
        courseId: base.course.id,
        enrollmentId: enrollment.id,
        teamId: team.id,
      });

      expect(notification).not.toBeNull();
      expect(notification!.userId).toBe(base.instructor.id);
      expect(notification!.type).toBe(schema.NotificationType.CouponRedeemed);
      expect(notification!.courseId).toBe(base.course.id);
      expect(notification!.actorUserId).toBe(base.user.id);
      expect(notification!.enrollmentId).toBe(enrollment.id);
      expect(notification!.teamId).toBe(team.id);
      expect(notification!.readAt).toBeNull();
    });
  });

  describe("getUnreadCountForUser", () => {
    it("returns 0 when the user has no notifications", () => {
      expect(getUnreadCountForUser(base.instructor.id)).toBe(0);
    });

    it("counts unread notifications for the recipient only", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      notifyEnrollment(enrollment);
      notifyEnrollment(enrollment);

      // Instructor is the recipient; the enrolling student is not.
      expect(getUnreadCountForUser(base.instructor.id)).toBe(2);
      expect(getUnreadCountForUser(base.user.id)).toBe(0);
    });

    it("excludes read notifications from the count", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      const notification = notifyEnrollment(enrollment);

      testDb
        .update(schema.notifications)
        .set({ readAt: new Date().toISOString() })
        .where(eq(schema.notifications.id, notification!.id))
        .run();

      expect(getUnreadCountForUser(base.instructor.id)).toBe(0);
    });
  });

  describe("getNotificationsForUser", () => {
    it("returns notifications newest-first with student and course display fields", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      const first = notifyEnrollment(enrollment);
      const second = notifyEnrollment(enrollment);

      const list = getNotificationsForUser(base.instructor.id, 10);

      expect(list).toHaveLength(2);
      // Newest-first: the most recently created id comes first.
      expect(list[0].id).toBe(second!.id);
      expect(list[1].id).toBe(first!.id);
      expect(list[0].actorName).toBe(base.user.name);
      expect(list[0].courseTitle).toBe(base.course.title);
    });

    it("respects the limit", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      notifyEnrollment(enrollment);
      notifyEnrollment(enrollment);
      notifyEnrollment(enrollment);

      expect(getNotificationsForUser(base.instructor.id, 2)).toHaveLength(2);
    });

    it("only returns the recipient's own notifications", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      notifyEnrollment(enrollment);

      // The enrolling student is not a recipient.
      expect(getNotificationsForUser(base.user.id, 10)).toHaveLength(0);
    });
  });

  describe("markNotificationRead", () => {
    it("marks a single notification read for its recipient", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      const notification = notifyEnrollment(enrollment);

      const updated = markNotificationRead(
        notification!.id,
        base.instructor.id
      );

      expect(updated!.readAt).not.toBeNull();
      expect(getUnreadCountForUser(base.instructor.id)).toBe(0);
    });

    it("does not mark a notification read for a different user", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      const notification = notifyEnrollment(enrollment);

      // The enrolling student is not the recipient and cannot mutate it.
      const updated = markNotificationRead(notification!.id, base.user.id);

      expect(updated).toBeUndefined();
      expect(getUnreadCountForUser(base.instructor.id)).toBe(1);
    });
  });

  describe("markAllRead", () => {
    it("marks all of the recipient's unread notifications read", () => {
      const enrollment = createEnrollment(base.user.id, base.course.id);
      notifyEnrollment(enrollment);
      notifyEnrollment(enrollment);

      const count = markAllRead(base.instructor.id);

      expect(count).toBe(2);
      expect(getUnreadCountForUser(base.instructor.id)).toBe(0);
    });

    it("leaves other users' notifications untouched", () => {
      // A second instructor with their own course and enrollment.
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other-instructor@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      notifyEnrollment(createEnrollment(base.user.id, base.course.id));
      notifyEnrollment(createEnrollment(base.user.id, otherCourse.id));

      markAllRead(base.instructor.id);

      expect(getUnreadCountForUser(base.instructor.id)).toBe(0);
      expect(getUnreadCountForUser(otherInstructor.id)).toBe(1);
    });
  });
});
