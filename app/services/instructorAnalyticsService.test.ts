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

/** Creates a module + lesson + quiz under a course and returns the quiz. */
function createQuiz(courseId: number, slug: string) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: `Module ${slug}`, position: 1 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: `Lesson ${slug}`, position: 1 })
    .returning()
    .get();
  const quiz = testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: `Quiz ${slug}`, passingScore: 0.7 })
    .returning()
    .get();
  return quiz;
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
      const lonely = createInstructor("Lonely", "lonely@example.com");

      const summary = getInstructorAnalyticsSummary(lonely.id);

      expect(summary).toEqual({
        totalEnrollments: 0,
        completedEnrollments: 0,
        completionRate: 0,
        totalRevenue: 0,
        averageQuizScore: 0,
        passRate: 0,
        attemptCount: 0,
        distinctQuizCount: 0,
      });
    });

    it("aggregates enrollments, revenue and completion rate across multiple owned courses", () => {
      // base.course is owned by base.instructor. Add a second owned course.
      const course2 = createCourse(base.instructor.id, "owned-2");

      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      const s3 = createStudent("S3", "s3@example.com");
      const s4 = createStudent("S4", "s4@example.com");

      // 4 enrollments total; 2 completed → 50%.
      enroll(s1.id, base.course.id, true);
      enroll(s2.id, base.course.id, false);
      enroll(s3.id, course2.id, true);
      enroll(s4.id, course2.id, false);

      // Revenue: 4999 + 2500 + 1000 = 8499 cents.
      purchase(s1.id, base.course.id, 4999);
      purchase(s3.id, course2.id, 2500);
      purchase(s4.id, course2.id, 1000);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.totalEnrollments).toBe(4);
      expect(summary.completedEnrollments).toBe(2);
      expect(summary.completionRate).toBe(50);
      expect(summary.totalRevenue).toBe(8499);
    });

    it("computes completion rate as a non-round percentage correctly", () => {
      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      const s3 = createStudent("S3", "s3@example.com");

      enroll(s1.id, base.course.id, true);
      enroll(s2.id, base.course.id, false);
      enroll(s3.id, base.course.id, false);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.totalEnrollments).toBe(3);
      expect(summary.completionRate).toBeCloseTo(33.333, 2);
    });

    it("returns completion rate 0 (no divide-by-zero) when there are no enrollments", () => {
      const summary = getInstructorAnalyticsSummary(base.instructor.id);
      expect(summary.totalEnrollments).toBe(0);
      expect(summary.completionRate).toBe(0);
    });

    it("sums varied PPP-discounted purchase amounts and returns 0 with no purchases", () => {
      const noPurchases = getInstructorAnalyticsSummary(base.instructor.id);
      expect(noPurchases.totalRevenue).toBe(0);

      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");
      // Two students paid different (PPP-adjusted) amounts for the same course.
      purchase(s1.id, base.course.id, 4999);
      purchase(s2.id, base.course.id, 1499);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);
      expect(summary.totalRevenue).toBe(6498);
    });

    it("averages all quiz attempt scores (not best-per-user) and computes pass rate", () => {
      const quizA = createQuiz(base.course.id, "a");
      const quizB = createQuiz(base.course.id, "b");
      const s1 = createStudent("S1", "s1@example.com");
      const s2 = createStudent("S2", "s2@example.com");

      // 4 attempts across 2 quizzes: scores 0.5, 1.0, 0.6, 0.9 → mean 0.75 → 75%.
      // passed: false, true, false, true → 2/4 = 50%.
      attempt(s1.id, quizA.id, 0.5, false);
      attempt(s1.id, quizA.id, 1.0, true); // same user, both attempts count
      attempt(s2.id, quizA.id, 0.6, false);
      attempt(s2.id, quizB.id, 0.9, true);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.attemptCount).toBe(4);
      expect(summary.distinctQuizCount).toBe(2);
      expect(summary.averageQuizScore).toBeCloseTo(75, 5);
      expect(summary.passRate).toBe(50);
    });

    it("returns quiz average and pass rate 0 (no divide-by-zero) when there are no attempts", () => {
      createQuiz(base.course.id, "a"); // quiz exists but no attempts
      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.attemptCount).toBe(0);
      expect(summary.distinctQuizCount).toBe(0);
      expect(summary.averageQuizScore).toBe(0);
      expect(summary.passRate).toBe(0);
    });

    it("never counts another instructor's courses toward the totals", () => {
      const other = createInstructor("Other", "other@example.com");
      const otherCourse = createCourse(other.id, "other-course");
      const otherStudent = createStudent("OS", "os@example.com");

      // Activity on the other instructor's course.
      enroll(otherStudent.id, otherCourse.id, true);
      purchase(otherStudent.id, otherCourse.id, 9999);
      const otherQuiz = createQuiz(otherCourse.id, "other");
      attempt(otherStudent.id, otherQuiz.id, 1.0, true);

      // base.instructor has one owned course with one enrollment and one purchase.
      const mine = createStudent("Mine", "mine@example.com");
      enroll(mine.id, base.course.id, false);
      purchase(mine.id, base.course.id, 2000);

      const summary = getInstructorAnalyticsSummary(base.instructor.id);

      expect(summary.totalEnrollments).toBe(1);
      expect(summary.completedEnrollments).toBe(0);
      expect(summary.totalRevenue).toBe(2000);
      // No attempts on owned courses.
      expect(summary.attemptCount).toBe(0);
    });
  });
});
