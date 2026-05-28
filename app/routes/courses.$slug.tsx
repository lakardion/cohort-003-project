import { useEffect } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { z } from "zod";
import { toast } from "sonner";
import type { Route } from "./+types/courses.$slug";
import {
  getCourseBySlug,
  getCourseWithDetails,
  getLessonCountForCourse,
} from "~/services/courseService";
import {
  getCourseRatingSummary,
  getUserRatingForCourse,
  rateCourse,
} from "~/services/ratingService";
import {
  createComment,
  deleteComment,
  getCourseComments,
  updateComment,
} from "~/services/commentService";
import { parseFormData } from "~/lib/validation";
import {
  StarRatingDisplay,
  StarRatingInput,
} from "~/components/star-rating";
import { CommentSection } from "~/components/comment-section";
import { isUserEnrolled } from "~/services/enrollmentService";
import { getUserById } from "~/services/userService";
import {
  calculateProgress,
  getLessonProgressForCourse,
  getNextIncompleteLesson,
} from "~/services/progressService";
import { getCurrentUserId } from "~/lib/session";
import { LessonProgressStatus, UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContentNoShift,
} from "~/components/ui/tabs";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Pencil,
  PlayCircle,
  Star,
  Users,
} from "lucide-react";
import { CourseImage } from "~/components/course-image";
import { UserAvatar } from "~/components/user-avatar";
import { data, isRouteErrorResponse } from "react-router";
import { formatDuration, formatPrice } from "~/lib/utils";
import { renderMarkdown } from "~/lib/markdown.server";
import { resolveCountry } from "~/lib/country.server";
import { calculatePppPrice, getCountryTierInfo } from "~/lib/ppp";

export function meta({ data: loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course";
  return [
    { title: `${title} — Cadence` },
    { name: "description", content: loaderData?.course?.description ?? "" },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found", { status: 404 });
  }

  const lessonCount = getLessonCountForCourse(course.id);
  const currentUserId = await getCurrentUserId(request);

  let enrolled = false;
  let progress = 0;
  let lessonProgressMap: Record<number, string> = {};
  let nextLessonId: number | null = null;

  if (currentUserId) {
    enrolled = isUserEnrolled(currentUserId, course.id);

    if (enrolled) {
      progress = calculateProgress(currentUserId, course.id, false, false);

      const progressRecords = getLessonProgressForCourse(
        currentUserId,
        course.id
      );
      for (const record of progressRecords) {
        lessonProgressMap[record.lessonId] = record.status;
      }

      const nextLesson = getNextIncompleteLesson(currentUserId, course.id);
      nextLessonId = nextLesson?.id ?? null;
    }
  }

  // Render sales copy from Markdown to HTML server-side
  const salesCopyHtml = courseWithDetails.salesCopy
    ? await renderMarkdown(courseWithDetails.salesCopy)
    : null;

  const country = await resolveCountry(request);
  const pppPrice = courseWithDetails.pppEnabled
    ? calculatePppPrice(courseWithDetails.price, country)
    : courseWithDetails.price;
  const tierInfo = getCountryTierInfo(country);

  const ratingSummary = getCourseRatingSummary(course.id);
  const userRating = currentUserId
    ? (getUserRatingForCourse(currentUserId, course.id)?.rating ?? null)
    : null;

  const comments = getCourseComments(course.id);
  const currentUserRole = currentUserId
    ? (getUserById(currentUserId)?.role ?? null)
    : null;

  return {
    course: courseWithDetails,
    salesCopyHtml,
    lessonCount,
    enrolled,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
    ratingSummary,
    userRating,
    comments,
    currentUserRole,
  };
}

const rateCourseSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
});

const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty"),
  parentId: z.coerce.number().int().positive().optional(),
});

const updateCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1, "Comment cannot be empty"),
});

const deleteCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

// Enrollment is handled via the purchase confirmation page; this action
// records star ratings and handles course discussion comments. The `intent`
// form field selects which operation to run.
export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const course = getCourseBySlug(params.slug);
  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "create-comment": {
      // Enrolled students and any instructor may post; everyone else is read-only.
      const canPost =
        isUserEnrolled(currentUserId, course.id) ||
        getUserById(currentUserId)?.role === UserRole.Instructor;
      if (!canPost) {
        return data(
          { errors: { content: "You can't post in this discussion." } },
          { status: 403 }
        );
      }
      const parsed = parseFormData(formData, createCommentSchema);
      if (!parsed.success) {
        return data({ errors: parsed.errors }, { status: 400 });
      }
      try {
        createComment(
          currentUserId,
          course.id,
          parsed.data.content,
          parsed.data.parentId
        );
      } catch (error) {
        return data(
          { errors: { content: (error as Error).message } },
          { status: 400 }
        );
      }
      return { success: true };
    }

    case "update-comment": {
      const parsed = parseFormData(formData, updateCommentSchema);
      if (!parsed.success) {
        return data({ errors: parsed.errors }, { status: 400 });
      }
      try {
        updateComment(parsed.data.commentId, currentUserId, parsed.data.content);
      } catch (error) {
        return data(
          { errors: { content: (error as Error).message } },
          { status: 400 }
        );
      }
      return { success: true };
    }

    case "delete-comment": {
      const parsed = parseFormData(formData, deleteCommentSchema);
      if (!parsed.success) {
        return data({ errors: parsed.errors }, { status: 400 });
      }
      const isCourseOwner = currentUserId === course.instructorId;
      try {
        deleteComment(parsed.data.commentId, currentUserId, isCourseOwner);
      } catch (error) {
        return data({ error: (error as Error).message }, { status: 403 });
      }
      return { success: true };
    }

    case "rate":
    default: {
      // Only enrolled students may rate the course.
      if (!isUserEnrolled(currentUserId, course.id)) {
        return data(
          { errors: { rating: "Only enrolled students can rate this course." } },
          { status: 403 }
        );
      }
      const parsed = parseFormData(formData, rateCourseSchema);
      if (!parsed.success) {
        return data({ errors: parsed.errors }, { status: 400 });
      }
      rateCourse(currentUserId, course.id, parsed.data.rating);
      return { success: true, rating: parsed.data.rating };
    }
  }
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6">
        <Skeleton className="h-4 w-48" />
      </nav>
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="mb-6 aspect-video rounded-lg" />
          <Skeleton className="mb-2 h-4 w-20" />
          <Skeleton className="mb-3 h-9 w-3/4" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-4 h-4 w-2/3" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
      <Skeleton className="mb-4 h-8 w-40" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function CourseDetail({ loaderData }: Route.ComponentProps) {
  const {
    course,
    salesCopyHtml,
    lessonCount,
    enrolled,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
    ratingSummary,
    userRating,
    comments,
    currentUserRole,
  } = loaderData;
  const isInstructor = currentUserId === course.instructorId;
  // Enrolled students and any instructor may join the discussion; everyone
  // else can read it but not post.
  const canComment = enrolled || currentUserRole === UserRole.Instructor;
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("already_enrolled") === "1") {
      toast.info("You're already enrolled in this course.");
      setSearchParams(
        (prev) => {
          prev.delete("already_enrolled");
          return prev;
        },
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams]);

  const totalDuration = course.modules.reduce(
    (sum, mod) =>
      sum + mod.lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0),
    0
  );

  const pppPriceLabel = formatPrice(pppPrice);
  const isDiscounted = pppPrice < course.price;

  const selfPurchaseLink = currentUserId
    ? `/courses/${course.slug}/purchase`
    : `/signup?redirectTo=${encodeURIComponent(`/courses/${course.slug}/purchase`)}`;

  const teamPurchaseLink = currentUserId
    ? `/courses/${course.slug}/purchase?mode=team`
    : `/signup?redirectTo=${encodeURIComponent(`/courses/${course.slug}/purchase?mode=team`)}`;

  const priceDisplay = (
    <div className="mb-3 text-center">
      {isDiscounted ? (
        <>
          <div className="text-sm text-muted-foreground line-through">
            {formatPrice(course.price)}
          </div>
          <div className="text-2xl font-bold">{pppPriceLabel}</div>
          <div className="mt-1 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
            {tierInfo.label} — PPP discount
          </div>
        </>
      ) : (
        <div className="text-2xl font-bold">{pppPriceLabel}</div>
      )}
    </div>
  );

  const enrollButton = (
    <Tabs defaultValue="self">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="self" className="flex-1 text-xs">
          Buy for Myself
        </TabsTrigger>
        <TabsTrigger value="team" className="flex-1 text-xs">
          Buy for Team
        </TabsTrigger>
      </TabsList>
      <TabsContentNoShift>
        <TabsContent value="self" forceMount>
          {priceDisplay}
          <Link to={selfPurchaseLink}>
            <Button size="lg" className="w-full">
              Enroll Now — {pppPriceLabel}
            </Button>
          </Link>
        </TabsContent>
        <TabsContent value="team" forceMount>
          {priceDisplay}
          <Link to={teamPurchaseLink}>
            <Button size="lg" variant="outline" className="w-full">
              Buy for Your Team
            </Button>
          </Link>
        </TabsContent>
      </TabsContentNoShift>
    </Tabs>
  );

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/courses" className="hover:text-foreground">
          Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{course.title}</span>
      </nav>

      {/* Hero section */}
      <div className="mb-8">
        <div className="mb-6 aspect-video max-h-64 overflow-hidden rounded-lg">
          <CourseImage
            src={course.coverImageUrl}
            alt={course.title}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="mb-2 text-sm font-medium text-primary">
          {course.categoryName}
        </div>
        <div className="mb-3 flex items-start justify-between gap-4">
          <h1 className="text-4xl font-bold">{course.title}</h1>
          {currentUserId === course.instructorId && (
            <Link to={`/instructor/${course.id}`}>
              <Button variant="outline" size="sm" className="shrink-0">
                <Pencil className="mr-1.5 size-3.5" />
                Edit Course
              </Button>
            </Link>
          )}
        </div>
        {/* Prominent average rating — grabs attention near the title */}
        <div className="mb-4">
          {ratingSummary.count > 0 ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1.5 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-900/40">
              <span className="text-xl font-bold tabular-nums text-yellow-700 dark:text-yellow-300">
                {ratingSummary.average.toFixed(1)}
              </span>
              <Star className="size-5 fill-yellow-400 text-yellow-400" />
              <span className="text-sm text-muted-foreground">
                ({ratingSummary.count}{" "}
                {ratingSummary.count === 1 ? "rating" : "ratings"})
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Star className="size-4" />
              No ratings yet
            </span>
          )}
        </div>
        <p className="mb-4 text-lg text-muted-foreground">
          {course.description}
        </p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserAvatar
              name={course.instructorName}
              avatarUrl={course.instructorAvatarUrl}
              className="size-5"
            />
            {course.instructorName}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="size-4" />
            {lessonCount} lessons
          </span>
          {totalDuration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="size-4" />
              {formatDuration(totalDuration, true, false, false)} total
            </span>
          )}
        </div>
      </div>

      {/* Two-column: sales copy left, sidebar right */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: sales copy + course content */}
        <div className="lg:col-span-2">
          {salesCopyHtml ? (
            <div
              className="prose prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: salesCopyHtml }}
            />
          ) : (
            <p className="text-muted-foreground">{course.description}</p>
          )}

          {/* Bottom CTA */}
          {!enrolled && !isInstructor && (
            <div className="mt-8 rounded-lg border bg-muted/50 p-6">
              <h3 className="mb-2 text-lg font-semibold">
                Ready to get started?
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Join this course and start learning today.
              </p>
              {enrollButton}
            </div>
          )}

          {enrolled && (
            <div className="mt-8">
              <RateCourseSection userRating={userRating} />
            </div>
          )}

          <div className="mt-8">
            <CourseContent
              course={course}
              enrolled={enrolled}
              isInstructor={isInstructor}
              lessonProgressMap={lessonProgressMap}
            />
          </div>

          <div className="mt-8">
            <CommentSection
              comments={comments}
              courseInstructorId={course.instructorId}
              currentUserId={currentUserId}
              canPost={canComment}
            />
          </div>
        </div>

        {/* Right column: progress/enrollment card */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {isInstructor
                  ? "Your Course"
                  : enrolled
                    ? "Your Progress"
                    : "Get Started"}
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {isInstructor ? (
                <Link to={`/instructor/${course.id}`}>
                  <Button className="w-full">
                    <Pencil className="mr-2 size-4" />
                    Manage Course
                  </Button>
                </Link>
              ) : enrolled ? (
                <>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>{progress}% complete</span>
                  </div>
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {course.modules.length > 0 &&
                    (() => {
                      const targetLessonId =
                        nextLessonId ?? course.modules[0].lessons[0]?.id;
                      return targetLessonId ? (
                        <Link
                          to={`/courses/${course.slug}/lessons/${targetLessonId}`}
                        >
                          <Button className="w-full">
                            <PlayCircle className="mr-2 size-4" />
                            {progress > 0
                              ? "Continue Learning"
                              : "Start Course"}
                          </Button>
                        </Link>
                      ) : null;
                    })()}
                  <Link to={teamPurchaseLink}>
                    <Button variant="outline" className="w-full">
                      <Users className="mr-2 size-4" />
                      Buy More Seats
                    </Button>
                  </Link>
                </>
              ) : (
                enrollButton
              )}
              <div className="space-y-2 pt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4" />
                  <span>{lessonCount} lessons</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4" />
                  <span>
                    {formatDuration(totalDuration, true, false, false)} total
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <UserAvatar
                    name={course.instructorName}
                    avatarUrl={course.instructorAvatarUrl}
                    className="size-5"
                  />
                  <span>Taught by {course.instructorName}</span>
                </div>
                {course.instructorBio && (
                  <p className="mt-2 text-xs leading-relaxed">
                    {course.instructorBio}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CourseContent({
  course,
  enrolled,
  isInstructor,
  lessonProgressMap,
}: {
  course: {
    id: number;
    slug: string;
    modules: Array<{
      id: number;
      title: string;
      lessons: Array<{
        id: number;
        title: string;
        durationMinutes: number | null;
      }>;
    }>;
  };
  enrolled: boolean;
  isInstructor: boolean;
  lessonProgressMap: Record<number, string>;
}) {
  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">Course Content</h2>
      {course.modules.length === 0 ? (
        <p className="text-muted-foreground">
          No content has been added to this course yet.
        </p>
      ) : (
        <div className="space-y-4">
          {course.modules.map((mod) => (
            <Card key={mod.id}>
              <CardHeader>
                <h3 className="font-semibold">
                  <Link
                    to={`/courses/${course.slug}/${mod.id}`}
                    className="hover:underline"
                  >
                    {mod.title}
                  </Link>
                </h3>
                <p className="text-sm text-muted-foreground">
                  {mod.lessons.length} lessons
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {mod.lessons.map((lesson) => {
                    const status = lessonProgressMap[lesson.id];
                    const isCompleted =
                      status === LessonProgressStatus.Completed;
                    const isLessonInProgress =
                      status === LessonProgressStatus.InProgress;

                    if (isInstructor) {
                      return (
                        <li key={lesson.id}>
                          <Link
                            to={`/instructor/${course.id}/lessons/${lesson.id}`}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
                          >
                            <Pencil className="size-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1">{lesson.title}</span>
                            {lesson.durationMinutes && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="size-3" />
                                {formatDuration(
                                  lesson.durationMinutes,
                                  true,
                                  false,
                                  false
                                )}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    }

                    return (
                      <li key={lesson.id}>
                        {enrolled ? (
                          <Link
                            to={`/courses/${course.slug}/lessons/${lesson.id}`}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                            ) : isLessonInProgress ? (
                              <PlayCircle className="size-4 shrink-0 text-blue-500" />
                            ) : (
                              <Circle className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="flex-1">{lesson.title}</span>
                            {lesson.durationMinutes && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="size-3" />
                                {formatDuration(
                                  lesson.durationMinutes,
                                  true,
                                  false,
                                  false
                                )}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 px-3 py-2 text-sm">
                            <Circle className="size-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1">{lesson.title}</span>
                            {lesson.durationMinutes && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="size-3" />
                                {formatDuration(
                                  lesson.durationMinutes,
                                  true,
                                  false,
                                  false
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RateCourseSection({ userRating }: { userRating: number | null }) {
  const fetcher = useFetcher<{ success?: boolean; rating?: number }>();
  // Displayed rating is derived, not stored in state: while a submit is in
  // flight we optimistically show its value, otherwise we trust the loader's
  // saved rating. This keeps the stars in sync when the loader revalidates
  // (e.g. switching users in the DevUI) instead of holding a stale value.
  const inFlightRating = fetcher.formData
    ? Number(fetcher.formData.get("rating"))
    : null;
  const displayRating = inFlightRating ?? userRating ?? 0;

  function handleRate(rating: number) {
    // Skip the request when re-clicking the already-saved rating.
    if (rating === displayRating) return;
    fetcher.submit(
      { intent: "rate", rating: String(rating) },
      { method: "post" }
    );
  }

  const isSaving = fetcher.state !== "idle";
  const savedRating = fetcher.data?.rating;
  // Only celebrate when the fetcher's result matches the loader's current
  // rating. After switching users the fetcher keeps its previous (now stale)
  // data, so this guard prevents a leftover "Thanks!" with the wrong value.
  const justSaved =
    fetcher.state === "idle" &&
    fetcher.data?.success === true &&
    savedRating != null &&
    savedRating === userRating;

  return (
    <section className="rounded-lg border bg-muted/30 p-6">
      <h2 className="mb-1 text-xl font-bold">Rate this course</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {userRating
          ? "You've rated this course. Pick a different star to update it."
          : "Tap a star to share what you thought."}
      </p>
      <StarRatingInput
        value={displayRating}
        onRate={handleRate}
        disabled={isSaving}
      />
      <div
        className="mt-3 min-h-5 text-sm"
        aria-live="polite"
        role="status"
      >
        {isSaving ? (
          <span className="text-muted-foreground">Saving your rating…</span>
        ) : justSaved ? (
          <span className="font-medium text-green-600 dark:text-green-400">
            Thanks! You rated this course {savedRating}{" "}
            {savedRating === 1 ? "star" : "stars"}.
          </span>
        ) : userRating ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            Your rating:
            <StarRatingDisplay value={userRating} size={16} />
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading this course.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Course not found";
      message =
        "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
