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
  toggleBookmark,
  isLessonBookmarked,
  getBookmarkedLessonIds,
} from "./bookmarkService";

function seedModule(courseId: number, title = "M1", position = 0) {
  return testDb
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

function seedLesson(moduleId: number, title = "L1", position = 0) {
  return testDb
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

function seedSecondCourse() {
  return testDb
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Another test course",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

describe("bookmarkService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("toggleBookmark", () => {
    it("creates a bookmark when none exists", () => {
      const mod = seedModule(base.course.id);
      const lesson = seedLesson(mod.id);

      const result = toggleBookmark({
        userId: base.user.id,
        lessonId: lesson.id,
      });

      expect(result.bookmarked).toBe(true);
      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(true);
    });

    it("removes the bookmark on a second toggle", () => {
      const mod = seedModule(base.course.id);
      const lesson = seedLesson(mod.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      const result = toggleBookmark({
        userId: base.user.id,
        lessonId: lesson.id,
      });

      expect(result.bookmarked).toBe(false);
      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(false);
    });

    it("keeps each user's bookmarks independent", () => {
      const mod = seedModule(base.course.id);
      const lesson = seedLesson(mod.id);
      const other = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(true);
      expect(
        isLessonBookmarked({ userId: other.id, lessonId: lesson.id })
      ).toBe(false);
    });
  });

  describe("isLessonBookmarked", () => {
    it("returns false when nothing is bookmarked", () => {
      const mod = seedModule(base.course.id);
      const lesson = seedLesson(mod.id);

      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(false);
    });

    it("returns true after bookmarking", () => {
      const mod = seedModule(base.course.id);
      const lesson = seedLesson(mod.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(true);
    });
  });

  describe("getBookmarkedLessonIds", () => {
    it("returns an empty array when the user has no bookmarks in the course", () => {
      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        })
      ).toEqual([]);
    });

    it("returns the IDs of every bookmarked lesson in the course", () => {
      const mod = seedModule(base.course.id);
      const l1 = seedLesson(mod.id, "L1", 0);
      const l2 = seedLesson(mod.id, "L2", 1);
      const l3 = seedLesson(mod.id, "L3", 2);

      toggleBookmark({ userId: base.user.id, lessonId: l1.id });
      toggleBookmark({ userId: base.user.id, lessonId: l3.id });

      const ids = getBookmarkedLessonIds({
        userId: base.user.id,
        courseId: base.course.id,
      }).sort((a, b) => a - b);
      expect(ids).toEqual([l1.id, l3.id]);
    });

    it("scopes results to the requested course", () => {
      const mod = seedModule(base.course.id);
      const l1 = seedLesson(mod.id);

      const otherCourse = seedSecondCourse();
      const otherMod = seedModule(otherCourse.id, "Other M");
      const otherLesson = seedLesson(otherMod.id, "Other L");

      toggleBookmark({ userId: base.user.id, lessonId: l1.id });
      toggleBookmark({ userId: base.user.id, lessonId: otherLesson.id });

      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        })
      ).toEqual([l1.id]);
      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: otherCourse.id,
        })
      ).toEqual([otherLesson.id]);
    });

    it("does not include other users' bookmarks", () => {
      const mod = seedModule(base.course.id);
      const lesson = seedLesson(mod.id);
      const other = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      toggleBookmark({ userId: other.id, lessonId: lesson.id });

      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        })
      ).toEqual([]);
    });
  });
});
