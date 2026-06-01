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
import { getInstructorAnalyticsSummary } from "./instructorAnalyticsService";

// ─── Seeding helpers ───

function makeCourse(
  instructorId: number,
  overrides: Partial<typeof schema.courses.$inferInsert> = {}
) {
  const suffix = Math.floor(Math.random() * 1e9);
  return testDb
    .insert(schema.courses)
    .values({
      title: `Course ${suffix}`,
      slug: `course-${suffix}`,
      description: "A course",
      instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
      ...overrides,
    })
    .returning()
    .get();
}

function makeStudent() {
  const suffix = Math.floor(Math.random() * 1e9);
  return testDb
    .insert(schema.users)
    .values({
      name: `Student ${suffix}`,
      email: `student-${suffix}@example.com`,
      role: schema.UserRole.Student,
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
    .values({ userId, courseId, pricePaid })
    .returning()
    .get();
}

/** Create a quiz under a course (via module → lesson → quiz) and return it. */
function makeQuiz(courseId: number) {
  const module = testDb
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 0 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson", position: 0 })
    .returning()
    .get();
  return testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: "Quiz", passingScore: 0.7 })
    .returning()
    .get();
}

function attempt(
  userId: number,
  quizId: number,
  score: number,
  passed: boolean
) {
  return testDb
    .insert(schema.quizAttempts)
    .values({ userId, quizId, score, passed })
    .returning()
    .get();
}

describe("instructorAnalyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getInstructorAnalyticsSummary", () => {
    it("returns a well-formed zeroed summary when the instructor owns no courses", () => {
      const lonelyInstructor = testDb
        .insert(schema.users)
        .values({
          name: "No Courses",
          email: "nocourses@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const summary = getInstructorAnalyticsSummary(lonelyInstructor.id);

      expect(summary).toEqual({
        totalEnrollments: 0,
        completedEnrollments: 0,
        completionRate: 0,
        totalRevenue: 0,
        averageQuizScore: 0,
        passRate: 0,
        attemptCount: 0,
        quizCount: 0,
      });
    });

    it("aggregates enrollments and completion rate across multiple owned courses", () => {
      // base.course + a second owned course
      const course2 = makeCourse(base.instructor.id);

      const s1 = makeStudent();
      const s2 = makeStudent();
      const s3 = makeStudent();
      const s4 = makeStudent();

      // base.course: 2 enrollments, 1 completed
      enroll(s1.id, base.course.id, true);
      enroll(s2.id, base.course.id, false);
      // course2: 2 enrollments, 1 completed
      enroll(s3.id, course2.id, true);
      enroll(s4.id, course2.id, false);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.totalEnrollments).toBe(4);
      expect(summary.completedEnrollments).toBe(2);
      expect(summary.completionRate).toBe(50);
    });

    it("returns completion rate 0 (no divide-by-zero) when there are no enrollments", () => {
      const summary = getInstructorAnalyticsSummary(base.instructor.id);
      expect(summary.totalEnrollments).toBe(0);
      expect(summary.completionRate).toBe(0);
    });

    it("sums revenue from actual pricePaid, including varied PPP-discounted amounts", () => {
      const course2 = makeCourse(base.instructor.id);
      const s1 = makeStudent();
      const s2 = makeStudent();
      const s3 = makeStudent();

      // Varied amounts (e.g. PPP-discounted) — sum is what matters.
      purchase(s1.id, base.course.id, 5000);
      purchase(s2.id, base.course.id, 2500);
      purchase(s3.id, course2.id, 1999);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);
      expect(summary.totalRevenue).toBe(5000 + 2500 + 1999);
    });

    it("returns revenue 0 when there are no purchases", () => {
      const summary = getInstructorAnalyticsSummary(base.instructor.id);
      expect(summary.totalRevenue).toBe(0);
    });

    it("computes average quiz score and pass rate across multiple quizzes (all attempts)", () => {
      const quizA = makeQuiz(base.course.id);
      const quizB = makeQuiz(base.course.id);
      const s1 = makeStudent();
      const s2 = makeStudent();

      // scores 0.8, 0.6, 0.4, 0.2 → mean 0.5 → 50%; 2 of 4 passed → 50%
      attempt(s1.id, quizA.id, 0.8, true);
      attempt(s2.id, quizA.id, 0.6, false);
      attempt(s1.id, quizB.id, 0.4, false);
      attempt(s2.id, quizB.id, 0.2, false);
      // Mark one of the false as passed to get 2/4
      attempt(s1.id, quizB.id, 0.9, true);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      // mean of 0.8, 0.6, 0.4, 0.2, 0.9 = 0.58 → 58%
      expect(summary.averageQuizScore).toBe(58);
      expect(summary.attemptCount).toBe(5);
      expect(summary.quizCount).toBe(2);
      // 2 passed of 5 → 40%
      expect(summary.passRate).toBe(40);
    });

    it("returns quiz average and pass rate 0 when there are no attempts", () => {
      makeQuiz(base.course.id); // a quiz with no attempts
      const summary = getInstructorAnalyticsSummary(base.instructor.id);
      expect(summary.averageQuizScore).toBe(0);
      expect(summary.passRate).toBe(0);
      expect(summary.attemptCount).toBe(0);
      expect(summary.quizCount).toBe(0);
    });

    it("never counts data from a course owned by another instructor", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const otherCourse = makeCourse(otherInstructor.id);

      // Activity on the other instructor's course.
      const s1 = makeStudent();
      enroll(s1.id, otherCourse.id, true);
      purchase(s1.id, otherCourse.id, 9999);
      const otherQuiz = makeQuiz(otherCourse.id);
      attempt(s1.id, otherQuiz.id, 1.0, true);

      // Some activity on our instructor's course for contrast.
      const s2 = makeStudent();
      enroll(s2.id, base.course.id, false);
      purchase(s2.id, base.course.id, 1000);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.totalEnrollments).toBe(1);
      expect(summary.completedEnrollments).toBe(0);
      expect(summary.totalRevenue).toBe(1000);
      expect(summary.attemptCount).toBe(0);
      expect(summary.quizCount).toBe(0);

      // And the other instructor sees only their own.
      const otherSummary = getInstructorAnalyticsSummary(otherInstructor.id);
      expect(otherSummary.totalEnrollments).toBe(1);
      expect(otherSummary.completedEnrollments).toBe(1);
      expect(otherSummary.totalRevenue).toBe(9999);
      expect(otherSummary.attemptCount).toBe(1);
      expect(otherSummary.passRate).toBe(100);
    });
  });
});
