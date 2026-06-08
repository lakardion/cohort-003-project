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
  getUnreadCountForUser,
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
});
