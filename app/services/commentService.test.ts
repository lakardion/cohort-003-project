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
  createComment,
  updateComment,
  deleteComment,
  getCourseComments,
  MAX_COMMENT_LENGTH,
} from "./commentService";

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

describe("commentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createComment", () => {
    it("creates a top-level comment", () => {
      const comment = createComment(base.user.id, base.course.id, "Great course!");

      expect(comment).toBeDefined();
      expect(comment.userId).toBe(base.user.id);
      expect(comment.courseId).toBe(base.course.id);
      expect(comment.parentId).toBeNull();
      expect(comment.content).toBe("Great course!");
    });

    it("trims content before storing it", () => {
      const comment = createComment(base.user.id, base.course.id, "  spaced  ");
      expect(comment.content).toBe("spaced");
    });

    it("creates a reply to a top-level comment", () => {
      const parent = createComment(base.user.id, base.course.id, "Question?");
      const reply = createComment(
        base.instructor.id,
        base.course.id,
        "Answer.",
        parent.id
      );

      expect(reply.parentId).toBe(parent.id);
    });

    it("rejects replying to a reply (nesting > 1)", () => {
      const parent = createComment(base.user.id, base.course.id, "Top");
      const reply = createComment(
        base.instructor.id,
        base.course.id,
        "Reply",
        parent.id
      );

      expect(() =>
        createComment(base.user.id, base.course.id, "Nested", reply.id)
      ).toThrowError(/reply to a reply/);
    });

    it("rejects a reply whose parent does not exist", () => {
      expect(() =>
        createComment(base.user.id, base.course.id, "Orphan", 9999)
      ).toThrowError(/Parent comment not found/);
    });

    it("rejects a reply whose parent belongs to another course", () => {
      const otherCourse = seedSecondCourse();
      const parent = createComment(base.user.id, otherCourse.id, "Elsewhere");

      expect(() =>
        createComment(base.user.id, base.course.id, "Mismatch", parent.id)
      ).toThrowError(/Parent comment not found/);
    });

    it("rejects empty / whitespace-only content", () => {
      expect(() =>
        createComment(base.user.id, base.course.id, "   ")
      ).toThrowError(/empty/);
    });

    it("rejects content over the max length", () => {
      const tooLong = "x".repeat(MAX_COMMENT_LENGTH + 1);
      expect(() =>
        createComment(base.user.id, base.course.id, tooLong)
      ).toThrowError(/exceed/);
    });
  });

  describe("getCourseComments", () => {
    it("returns an empty array when there are no comments", () => {
      expect(getCourseComments(base.course.id)).toEqual([]);
    });

    it("returns top-level comments with nested replies and author info", () => {
      const parent = createComment(base.user.id, base.course.id, "First");
      createComment(base.instructor.id, base.course.id, "Reply A", parent.id);
      createComment(base.user.id, base.course.id, "Second");

      const tree = getCourseComments(base.course.id);

      expect(tree).toHaveLength(2);
      expect(tree[0].content).toBe("First"); // ordered by createdAt
      expect(tree[1].content).toBe("Second");
      expect(tree[0].replies).toHaveLength(1);
      expect(tree[0].replies[0].content).toBe("Reply A");
      expect(tree[0].author).toMatchObject({
        id: base.user.id,
        name: base.user.name,
        role: base.user.role,
      });
      expect(tree[0].replies[0].author.id).toBe(base.instructor.id);
    });
  });

  describe("updateComment", () => {
    it("lets the author edit their own comment", () => {
      const comment = createComment(base.user.id, base.course.id, "typo");
      const updated = updateComment(comment.id, base.user.id, "fixed");
      expect(updated.content).toBe("fixed");
    });

    it("throws when a non-author tries to edit", () => {
      const comment = createComment(base.user.id, base.course.id, "mine");
      expect(() =>
        updateComment(comment.id, base.instructor.id, "hijack")
      ).toThrowError(/author/);
    });
  });

  describe("deleteComment", () => {
    it("lets the author delete their own comment", () => {
      const comment = createComment(base.user.id, base.course.id, "bye");
      deleteComment(comment.id, base.user.id, false);
      expect(getCourseComments(base.course.id)).toHaveLength(0);
    });

    it("lets the course owner delete another user's comment", () => {
      const comment = createComment(base.user.id, base.course.id, "student post");
      // instructor is the course owner here
      deleteComment(comment.id, base.instructor.id, true);
      expect(getCourseComments(base.course.id)).toHaveLength(0);
    });

    it("rejects an unrelated, non-owner user", () => {
      const other = seedSecondUser();
      const comment = createComment(base.user.id, base.course.id, "protected");
      expect(() => deleteComment(comment.id, other.id, false)).toThrowError(
        /Not allowed/
      );
    });

    it("cascade-deletes replies when deleting a parent", () => {
      const parent = createComment(base.user.id, base.course.id, "parent");
      createComment(base.instructor.id, base.course.id, "reply", parent.id);

      deleteComment(parent.id, base.user.id, false);

      expect(getCourseComments(base.course.id)).toHaveLength(0);
    });
  });
});
