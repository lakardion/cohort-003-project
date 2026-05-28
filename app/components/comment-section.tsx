import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { UserRole } from "~/db/schema";
import type { CourseComment, CourseCommentNode } from "~/services/commentService";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";

type Tier = "author" | "instructor" | "student";

function tierFor(comment: CourseComment, courseInstructorId: number): Tier {
  if (comment.author.id === courseInstructorId) return "author";
  if (comment.author.role === UserRole.Instructor) return "instructor";
  return "student";
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CommentSection({
  comments,
  courseInstructorId,
  currentUserId,
  canPost,
}: {
  comments: CourseCommentNode[];
  courseInstructorId: number;
  currentUserId: number | null;
  canPost: boolean;
}) {
  const isCourseOwner = currentUserId === courseInstructorId;
  const total = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);

  return (
    <section className="rounded-lg border bg-muted/30 p-6">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <MessageSquare className="size-5" />
        Discussion
        <span className="text-sm font-normal text-muted-foreground">
          ({total})
        </span>
      </h2>

      {canPost ? (
        <div className="mt-4">
          <CommentForm
            intent="create-comment"
            placeholder="Share a question or thought…"
            submitLabel="Post comment"
          />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Enroll in this course to join the discussion.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet.{canPost ? " Be the first to start the conversation." : ""}
          </p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              courseInstructorId={courseInstructorId}
              currentUserId={currentUserId}
              canPost={canPost}
              isCourseOwner={isCourseOwner}
            />
          ))
        )}
      </div>
    </section>
  );
}

const TIER_STYLES: Record<Tier, string> = {
  author: "border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-950/30",
  instructor: "border-blue-300 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-950/30",
  student: "border bg-card",
};

const TIER_BADGE: Record<Tier, string | null> = {
  author: "Course author",
  instructor: "Instructor",
  student: null,
};

const TIER_BADGE_STYLES: Record<Tier, string> = {
  author:
    "bg-amber-400 text-amber-950 dark:bg-amber-400/90 dark:text-amber-950",
  instructor:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  student: "",
};

function CommentItem({
  comment,
  courseInstructorId,
  currentUserId,
  canPost,
  isCourseOwner,
  isReply = false,
}: {
  comment: CourseCommentNode | CourseComment;
  courseInstructorId: number;
  currentUserId: number | null;
  canPost: boolean;
  isCourseOwner: boolean;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);

  const tier = tierFor(comment, courseInstructorId);
  const badge = TIER_BADGE[tier];
  const isOwnComment = currentUserId === comment.author.id;
  const canDelete = isOwnComment || isCourseOwner;
  const edited = comment.updatedAt !== comment.createdAt;
  const replies = "replies" in comment ? comment.replies : [];

  return (
    <div>
      <article
        className={cn(
          "rounded-lg border p-4",
          TIER_STYLES[tier]
        )}
      >
        <div className="flex items-center gap-2">
          <UserAvatar
            name={comment.author.name}
            avatarUrl={comment.author.avatarUrl}
            className="size-7"
          />
          <span className="font-medium">{comment.author.name}</span>
          {badge && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                TIER_BADGE_STYLES[tier]
              )}
            >
              {badge}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatTimestamp(comment.createdAt)}
            {edited && " (edited)"}
          </span>
        </div>

        {editing ? (
          <div className="mt-3">
            <CommentForm
              intent="update-comment"
              commentId={comment.id}
              defaultValue={comment.content}
              submitLabel="Save"
              onDone={() => setEditing(false)}
              showCancel
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm">{comment.content}</p>
        )}

        {!editing && (
          <div className="mt-3 flex items-center gap-1">
            {/* Replies are only allowed on top-level comments (single nesting level). */}
            {canPost && !isReply && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setReplying((v) => !v)}
              >
                <Reply className="size-3" />
                Reply
              </Button>
            )}
            {isOwnComment && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3" />
                Edit
              </Button>
            )}
            {canDelete && (
              <DeleteCommentButton commentId={comment.id} />
            )}
          </div>
        )}

        {replying && (
          <div className="mt-3">
            <CommentForm
              intent="create-comment"
              parentId={comment.id}
              placeholder={`Reply to ${comment.author.name}…`}
              submitLabel="Reply"
              onDone={() => setReplying(false)}
              showCancel
              onCancel={() => setReplying(false)}
            />
          </div>
        )}
      </article>

      {replies.length > 0 && (
        <div className="mt-3 ml-6 space-y-3 border-l pl-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              courseInstructorId={courseInstructorId}
              currentUserId={currentUserId}
              canPost={canPost}
              isCourseOwner={isCourseOwner}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentForm({
  intent,
  parentId,
  commentId,
  defaultValue = "",
  placeholder,
  submitLabel,
  onDone,
  showCancel = false,
  onCancel,
}: {
  intent: "create-comment" | "update-comment";
  parentId?: number;
  commentId?: number;
  defaultValue?: string;
  placeholder?: string;
  submitLabel: string;
  onDone?: () => void;
  showCancel?: boolean;
  onCancel?: () => void;
}) {
  const fetcher = useFetcher<{ success?: boolean; errors?: Record<string, string> }>();
  const [value, setValue] = useState(defaultValue);
  const isSubmitting = fetcher.state !== "idle";

  // Once a submit succeeds, clear the field (so a fresh comment box is empty)
  // and notify the parent so it can close an inline reply/edit form.
  const justSucceeded = fetcher.state === "idle" && fetcher.data?.success === true;
  useEffect(() => {
    if (!justSucceeded) return;
    setValue("");
    onDone?.();
  }, [justSucceeded, onDone]);

  const error = fetcher.data?.errors?.content;

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value={intent} />
      {parentId != null && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      {commentId != null && (
        <input type="hidden" name="commentId" value={commentId} />
      )}
      <Textarea
        name="content"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        required
        rows={3}
        disabled={isSubmitting}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting || value.trim() === ""}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {showCancel && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </fetcher.Form>
  );
}

function DeleteCommentButton({ commentId }: { commentId: number }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      onSubmit={(e) => {
        if (!confirm("Delete this comment? Replies will also be removed.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="delete-comment" />
      <input type="hidden" name="commentId" value={commentId} />
      <Button
        type="submit"
        variant="ghost"
        size="xs"
        disabled={isDeleting}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-3" />
        Delete
      </Button>
    </fetcher.Form>
  );
}
