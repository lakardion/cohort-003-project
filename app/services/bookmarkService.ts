import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

// ─── Bookmark Service ───
// Handles per-user lesson bookmarks. Bookmarks are private to each student and
// persist until the user manually removes them — completing a lesson does not
// clear its bookmark. A user can bookmark a lesson at most once (enforced by a
// unique index on (user_id, lesson_id)).

function findBookmark(opts: { userId: number; lessonId: number }) {
  return db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(lessonBookmarks.lessonId, opts.lessonId)
      )
    )
    .get();
}

export function isLessonBookmarked(opts: {
  userId: number;
  lessonId: number;
}): boolean {
  return !!findBookmark(opts);
}

/**
 * Toggles the bookmark on a lesson for the given user. If a bookmark exists it
 * is removed; otherwise a new one is inserted. Returns the resulting state so
 * the caller (typically an action) can echo it back to the client.
 */
export function toggleBookmark(opts: {
  userId: number;
  lessonId: number;
}): { bookmarked: boolean } {
  const existing = findBookmark(opts);
  if (existing) {
    db.delete(lessonBookmarks)
      .where(eq(lessonBookmarks.id, existing.id))
      .run();
    return { bookmarked: false };
  }

  db.insert(lessonBookmarks)
    .values({ userId: opts.userId, lessonId: opts.lessonId })
    .run();
  return { bookmarked: true };
}

/**
 * Returns the IDs of every lesson in the given course that the user has
 * bookmarked. Joins through modules so the result is scoped to one course —
 * used by loaders to batch-load bookmark state for the curriculum sidebar and
 * the course detail page without an N+1 lookup.
 */
export function getBookmarkedLessonIds(opts: {
  userId: number;
  courseId: number;
}): number[] {
  const rows = db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .innerJoin(lessons, eq(lessonBookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(modules.courseId, opts.courseId)
      )
    )
    .all();

  return rows.map((r) => r.lessonId);
}
