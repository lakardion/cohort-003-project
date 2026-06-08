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
  getInstructorsWithCourses,
  getPlatformAnalyticsSummary,
  getPlatformPerCourseAnalytics,
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

  describe("getPlatformPerCourseAnalytics", () => {
    it("returns one row per course across all instructors with the correct instructor name", () => {
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      const course2 = createCourse(instructor2.id, "inst2-course");

      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      const s3 = createStudent("S3", "s3@example.com");

      // base.course (Test Instructor): 2 enrollments, 1 completed → 50%, 4999.
      enroll(s1.id, base.course.id, true);
      enroll(s2.id, base.course.id, false);
      purchase(s1.id, base.course.id, 4999);

      // course2 (Inst 2): 1 enrollment completed → 100%, 2500.
      enroll(s3.id, course2.id, true);
      purchase(s3.id, course2.id, 2500);

      const rows = getPlatformPerCourseAnalytics();
      expect(rows).toHaveLength(2);

      const byCourse = new Map(rows.map((r) => [r.courseId, r]));

      const row1 = byCourse.get(base.course.id)!;
      expect(row1.instructorId).toBe(base.instructor.id);
      expect(row1.instructorName).toBe("Test Instructor");
      expect(row1.totalEnrollments).toBe(2);
      expect(row1.completedEnrollments).toBe(1);
      expect(row1.completionRate).toBe(50);
      expect(row1.revenue).toBe(4999);

      const row2 = byCourse.get(course2.id)!;
      expect(row2.instructorId).toBe(instructor2.id);
      expect(row2.instructorName).toBe("Inst 2");
      expect(row2.totalEnrollments).toBe(1);
      expect(row2.completionRate).toBe(100);
      expect(row2.revenue).toBe(2500);
    });

    it("includes zero-activity courses of every status with well-formed zeros", () => {
      const draft = createCourse(
        base.instructor.id,
        "draft",
        schema.CourseStatus.Draft
      );
      const archived = createCourse(
        base.instructor.id,
        "archived",
        schema.CourseStatus.Archived
      );

      const rows = getPlatformPerCourseAnalytics();
      // base.course (published) + draft + archived.
      expect(rows).toHaveLength(3);

      const byCourse = new Map(rows.map((r) => [r.courseId, r]));

      expect(byCourse.get(base.course.id)!.status).toBe(
        schema.CourseStatus.Published
      );
      expect(byCourse.get(draft.id)!.status).toBe(schema.CourseStatus.Draft);
      expect(byCourse.get(archived.id)!.status).toBe(
        schema.CourseStatus.Archived
      );

      // No enrollments/purchases anywhere → zeros, no divide-by-zero.
      for (const row of rows) {
        expect(row.totalEnrollments).toBe(0);
        expect(row.completedEnrollments).toBe(0);
        expect(row.completionRate).toBe(0);
        expect(row.revenue).toBe(0);
      }
    });

    it("scopes the rows to a single instructor when instructorId is given", () => {
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      createCourse(instructor2.id, "inst2-course");

      const scoped = getPlatformPerCourseAnalytics(base.instructor.id);

      expect(scoped).toHaveLength(1);
      expect(scoped[0].courseId).toBe(base.course.id);
      expect(scoped[0].instructorName).toBe("Test Instructor");
    });

    it("returns an empty array when the filtered instructor owns no courses", () => {
      const lonely = createInstructor("Lonely", "lonely@example.com");
      expect(getPlatformPerCourseAnalytics(lonely.id)).toEqual([]);
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

  describe("getInstructorsWithCourses", () => {
    it("returns only instructors who own at least one course", () => {
      const instructor2 = createInstructor("Inst 2", "inst2@example.com");
      createCourse(instructor2.id, "inst2-course");

      // An instructor and a student who own no courses must be excluded.
      createInstructor("Lonely", "lonely@example.com");
      createStudent("Stu", "stu@example.com");

      const result = getInstructorsWithCourses();

      const ids = result.map((r) => r.id).sort((a, b) => a - b);
      expect(ids).toEqual(
        [base.instructor.id, instructor2.id].sort((a, b) => a - b)
      );

      const names = result.map((r) => r.name);
      expect(names).toContain("Test Instructor");
      expect(names).toContain("Inst 2");
      expect(names).not.toContain("Lonely");
      expect(names).not.toContain("Stu");
    });

    it("returns one entry per instructor even when they own multiple courses", () => {
      createCourse(base.instructor.id, "second");
      createCourse(base.instructor.id, "third");

      const result = getInstructorsWithCourses();

      expect(result.filter((r) => r.id === base.instructor.id)).toHaveLength(1);
    });

    it("returns an empty array when no courses exist", () => {
      testDb.delete(schema.courses).run();

      expect(getInstructorsWithCourses()).toEqual([]);
    });
  });
});
