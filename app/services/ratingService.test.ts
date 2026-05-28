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
  rateCourse,
  getUserRatingForCourse,
  getCourseRatingSummary,
} from "./ratingService";

function seedSecondUser() {
  return testDb
    .insert(schema.users)
    .values({
      name: "Second User",
      email: "second@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("rateCourse", () => {
    it("creates a rating for a user", () => {
      const rating = rateCourse(base.user.id, base.course.id, 4);

      expect(rating).toBeDefined();
      expect(rating.userId).toBe(base.user.id);
      expect(rating.courseId).toBe(base.course.id);
      expect(rating.rating).toBe(4);
    });

    it("updates the existing rating when the user rates again", () => {
      rateCourse(base.user.id, base.course.id, 2);
      const updated = rateCourse(base.user.id, base.course.id, 5);

      expect(updated.rating).toBe(5);

      const summary = getCourseRatingSummary(base.course.id);
      expect(summary.count).toBe(1); // still a single row, not a duplicate
      expect(summary.average).toBe(5);
    });

    it("throws when the rating is below the minimum", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 0)).toThrowError(
        /between 1 and 5/
      );
    });

    it("throws when the rating is above the maximum", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 6)).toThrowError(
        /between 1 and 5/
      );
    });

    it("throws when the rating is not an integer", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 3.5)).toThrowError(
        /between 1 and 5/
      );
    });
  });

  describe("getUserRatingForCourse", () => {
    it("returns undefined when the user has not rated the course", () => {
      expect(
        getUserRatingForCourse(base.user.id, base.course.id)
      ).toBeUndefined();
    });

    it("returns the user's rating after they rate", () => {
      rateCourse(base.user.id, base.course.id, 3);
      const found = getUserRatingForCourse(base.user.id, base.course.id);
      expect(found?.rating).toBe(3);
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns zero average and count when there are no ratings", () => {
      const summary = getCourseRatingSummary(base.course.id);
      expect(summary.average).toBe(0);
      expect(summary.count).toBe(0);
    });

    it("averages ratings across multiple users", () => {
      const second = seedSecondUser();
      rateCourse(base.user.id, base.course.id, 5);
      rateCourse(second.id, base.course.id, 2);

      const summary = getCourseRatingSummary(base.course.id);
      expect(summary.count).toBe(2);
      expect(summary.average).toBe(3.5);
    });
  });
});
