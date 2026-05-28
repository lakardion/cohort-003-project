import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { courseComments, users, type UserRole } from "~/db/schema";

// ─── Comment Service ───
// Handles course discussion comments with at most one level of nesting:
// a top-level comment (parentId null) may have replies, but a reply cannot
// itself be replied to. Validation and the nesting rule live here so they are
// unit-testable. Authorization that needs course context (e.g. course owner)
// is passed in as an explicit fact rather than recomputed here.
// Uses positional parameters (project convention).

export const MAX_COMMENT_LENGTH = 2000;

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type CourseComment = {
  id: number;
  courseId: number;
  parentId: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
};

export type CourseCommentNode = CourseComment & {
  replies: CourseComment[];
};

function assertValidContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Returns the course's top-level comments (oldest first), each with its
 * replies (also oldest first), joined with author details.
 */
export function getCourseComments(courseId: number): CourseCommentNode[] {
  const rows = db
    .select({
      id: courseComments.id,
      courseId: courseComments.courseId,
      parentId: courseComments.parentId,
      content: courseComments.content,
      createdAt: courseComments.createdAt,
      updatedAt: courseComments.updatedAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(courseComments)
    .innerJoin(users, eq(courseComments.userId, users.id))
    .where(eq(courseComments.courseId, courseId))
    .orderBy(asc(courseComments.createdAt))
    .all();

  const toComment = (row: (typeof rows)[number]): CourseComment => ({
    id: row.id,
    courseId: row.courseId,
    parentId: row.parentId,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.authorId,
      name: row.authorName,
      avatarUrl: row.authorAvatarUrl,
      role: row.authorRole,
    },
  });

  const topLevel: CourseCommentNode[] = [];
  const repliesByParent = new Map<number, CourseComment[]>();

  for (const row of rows) {
    const comment = toComment(row);
    if (comment.parentId === null) {
      topLevel.push({ ...comment, replies: [] });
    } else {
      const list = repliesByParent.get(comment.parentId) ?? [];
      list.push(comment);
      repliesByParent.set(comment.parentId, list);
    }
  }

  for (const node of topLevel) {
    node.replies = repliesByParent.get(node.id) ?? [];
  }

  return topLevel;
}

/**
 * Creates a comment. When parentId is provided it must reference an existing
 * top-level comment on the same course; replying to a reply throws (enforces
 * the single nesting level).
 */
export function createComment(
  userId: number,
  courseId: number,
  content: string,
  parentId?: number | null
) {
  const trimmed = assertValidContent(content);

  if (parentId != null) {
    const parent = db
      .select()
      .from(courseComments)
      .where(eq(courseComments.id, parentId))
      .get();

    if (!parent || parent.courseId !== courseId) {
      throw new Error("Parent comment not found on this course");
    }
    if (parent.parentId !== null) {
      throw new Error("Cannot reply to a reply");
    }
  }

  return db
    .insert(courseComments)
    .values({ userId, courseId, content: trimmed, parentId: parentId ?? null })
    .returning()
    .get();
}

/**
 * Edits a comment's content. Only the comment's author may edit it.
 */
export function updateComment(
  commentId: number,
  requesterId: number,
  content: string
) {
  const comment = db
    .select()
    .from(courseComments)
    .where(eq(courseComments.id, commentId))
    .get();

  if (!comment) {
    throw new Error("Comment not found");
  }
  if (comment.userId !== requesterId) {
    throw new Error("Only the author can edit this comment");
  }

  const trimmed = assertValidContent(content);

  return db
    .update(courseComments)
    .set({ content: trimmed, updatedAt: new Date().toISOString() })
    .where(eq(courseComments.id, commentId))
    .returning()
    .get();
}

/**
 * Deletes a comment. Allowed for the comment's author or the course owner
 * (isCourseOwner). Deleting a top-level comment cascade-deletes its replies.
 */
export function deleteComment(
  commentId: number,
  requesterId: number,
  isCourseOwner: boolean
) {
  const comment = db
    .select()
    .from(courseComments)
    .where(eq(courseComments.id, commentId))
    .get();

  if (!comment) {
    throw new Error("Comment not found");
  }
  if (comment.userId !== requesterId && !isCourseOwner) {
    throw new Error("Not allowed to delete this comment");
  }

  // Cascade: remove replies before the parent itself.
  db.delete(courseComments)
    .where(eq(courseComments.parentId, commentId))
    .run();

  db.delete(courseComments).where(eq(courseComments.id, commentId)).run();
}
