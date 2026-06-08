import { describe, it, expect, beforeEach, vi } from "vitest";
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
  getPlatformAnalyticsSummary,
  getPlatformRevenueOverTime,
} from "./adminAnalyticsService";

// ─── Seeding helpers ───

function createInstructor(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Instructor })
    .returning()
    .get();
}

function createStudent(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function createCourse(
  instructorId: number,
  slug: string,
  status: schema.CourseStatus = schema.CourseStatus.Published
) {
  return testDb
    .insert(schema.courses)
    .values({
      title: `Course ${slug}`,
      slug,
      description: `Course ${slug}`,
      instructorId,
      categoryId: base.category.id,
      status,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number, completed: boolean) {
  return testDb
    .insert(schema.enrollments)
    .values({
      userId,
      courseId,
      completedAt: completed ? new Date().toISOString() : null,
    })
    .returning()
    .get();
}

function purchase(userId: number, courseId: number, pricePaid: number) {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId, pricePaid, country: null })
    .returning()
    .get();
}

/** Purchase with an explicit createdAt timestamp (ISO string). */
function purchaseAt(
  userId: number,
  courseId: number,
  pricePaid: number,
  createdAt: string
) {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId, pricePaid, country: null, createdAt })
    .returning()
    .get();
}

describe("adminAnalyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getPlatformAnalyticsSummary", () => {
    it("returns a well-formed zeroed summary on an empty platform", () => {
      // seedBaseData creates one course but no enrollments/purchases.
      const summary = getPlatformAnalyticsSummary();

      expect(summary).toEqual({
        totalEnrollments: 0,
        completedEnrollments: 0,
        completionRate: 0,
        totalRevenue: 0,
        courseCount: 1,
      });
    });

    it("aggregates revenue and enrollments across multiple instructors", () => {
      // base.course is owned by base.instructor. Add a second instructor +course.
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      const course2 = createCourse(instructor2.id, "inst2-course");

      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      const s3 = createStudent("S3", "s3@example.com");
      const s4 = createStudent("S4", "s4@example.com");

      // 4 enrollments across both instructors; 2 completed → 50%.
      enroll(s1.id, base.course.id, true);
      enroll(s2.id, base.course.id, false);
      enroll(s3.id, course2.id, true);
      enroll(s4.id, course2.id, false);

      // Revenue across both instructors: 4999 + 2500 + 1000 = 8499 cents.
      purchase(s1.id, base.course.id, 4999);
      purchase(s3.id, course2.id, 2500);
      purchase(s4.id, course2.id, 1000);

      const summary = getPlatformAnalyticsSummary();

      expect(summary.totalEnrollments).toBe(4);
      expect(summary.completedEnrollments).toBe(2);
      expect(summary.completionRate).toBe(50);
      expect(summary.totalRevenue).toBe(8499);
      // base.course + course2.
      expect(summary.courseCount).toBe(2);
    });

    it("counts courses of every status toward courseCount", () => {
      createCourse(base.instructor.id, "draft", schema.CourseStatus.Draft);
      createCourse(
        base.instructor.id,
        "archived",
        schema.CourseStatus.Archived
      );

      const summary = getPlatformAnalyticsSummary();

      // base.course (published) + draft + archived.
      expect(summary.courseCount).toBe(3);
    });

    it("computes completion rate as a non-round percentage correctly", () => {
      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      const s3 = createStudent("S3", "s3@example.com");

      enroll(s1.id, base.course.id, true);
      enroll(s2.id, base.course.id, false);
      enroll(s3.id, base.course.id, false);

      const summary = getPlatformAnalyticsSummary();

      expect(summary.totalEnrollments).toBe(3);
      expect(summary.completionRate).toBeCloseTo(33.333, 2);
    });

    it("scopes the summary to a single instructor when instructorId is given", () => {
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      const course2 = createCourse(instructor2.id, "inst2-course");

      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");

      // base.instructor: 1 completed enrollment + 2000 revenue.
      enroll(s1.id, base.course.id, true);
      purchase(s1.id, base.course.id, 2000);

      // instructor2: 1 enrollment + 9999 revenue (must be excluded when scoped).
      enroll(s2.id, course2.id, false);
      purchase(s2.id, course2.id, 9999);

      const scoped = getPlatformAnalyticsSummary(base.instructor.id);

      expect(scoped.courseCount).toBe(1);
      expect(scoped.totalEnrollments).toBe(1);
      expect(scoped.completedEnrollments).toBe(1);
      expect(scoped.completionRate).toBe(100);
      expect(scoped.totalRevenue).toBe(2000);
    });

    it("returns a zeroed summary when the filtered instructor owns no courses", () => {
      const lonely = createInstructor("Lonely", "lonely@example.com");

      const summary = getPlatformAnalyticsSummary(lonely.id);

      expect(summary).toEqual({
        totalEnrollments: 0,
        completedEnrollments: 0,
        completionRate: 0,
        totalRevenue: 0,
        courseCount: 0,
      });
    });
  });

  describe("getPlatformRevenueOverTime", () => {
    it("returns an empty array when there are no purchases", () => {
      // seedBaseData creates one course but no purchases.
      expect(getPlatformRevenueOverTime()).toEqual([]);
    });

    it("buckets summed revenue by day across all instructors, ordered chronologically", () => {
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      const course2 = createCourse(instructor2.id, "inst2-course");
      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      const s3 = createStudent("S3", "s3@example.com");

      // 2026-01-01: 4999 (inst1) + 1500 (inst2) = 6499; 2026-01-05: 2000.
      purchaseAt(s1.id, base.course.id, 4999, "2026-01-01T08:00:00.000Z");
      purchaseAt(s2.id, course2.id, 1500, "2026-01-01T22:00:00.000Z");
      purchaseAt(s3.id, base.course.id, 2000, "2026-01-05T10:00:00.000Z");

      expect(getPlatformRevenueOverTime()).toEqual([
        { date: "2026-01-01", revenue: 6499 },
        { date: "2026-01-05", revenue: 2000 },
      ]);
    });

    it("scopes the series to a single instructor when instructorId is given", () => {
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      const course2 = createCourse(instructor2.id, "inst2-course");
      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");

      purchaseAt(s1.id, base.course.id, 2000, "2026-01-01T00:00:00.000Z");
      // instructor2's revenue must be excluded when scoped to base.instructor.
      purchaseAt(s2.id, course2.id, 9999, "2026-01-01T00:00:00.000Z");

      expect(getPlatformRevenueOverTime(base.instructor.id)).toEqual([
        { date: "2026-01-01", revenue: 2000 },
      ]);
    });

    it("returns an empty array when the filtered instructor owns no courses", () => {
      const lonely = createInstructor("Lonely", "lonely@example.com");
      expect(getPlatformRevenueOverTime(lonely.id)).toEqual([]);
    });
  });
});
