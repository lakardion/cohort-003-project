import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCoursesByInstructor } from "~/services/courseService";
import { getInstructorAnalyticsSummary } from "~/services/instructorAnalyticsService";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  AlertTriangle,
  Award,
  BarChart3,
  DollarSign,
  GraduationCap,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatPrice } from "~/lib/utils";
import { CourseStatus, UserRole } from "~/db/schema";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    {
      name: "description",
      content: "Performance metrics across all of your courses",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view your analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  // All metrics are scoped to the signed-in instructor's own courses.
  // The per-course breakdown table and time-series graphs arrive in later slices.
  const instructorCourses = getCoursesByInstructor(currentUserId);

  const courses = instructorCourses.map((course) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    status: course.status,
  }));

  const summary = getInstructorAnalyticsSummary(currentUserId);

  // Shape into an already-formatted, serialisable view object so the
  // component stays presentational.
  const summaryView = {
    totalEnrollments: summary.totalEnrollments,
    totalRevenue: formatPrice(summary.totalRevenue),
    completionRate: `${Math.round(summary.completionRate)}%`,
    completedEnrollments: summary.completedEnrollments,
    averageQuizScore: `${Math.round(summary.averageQuizScore)}%`,
    attemptCount: summary.attemptCount,
    quizCount: summary.quizCount,
  };

  return { courses, summary: summaryView };
}

function statusBadge(status: string) {
  switch (status) {
    case CourseStatus.Published:
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
          Published
        </span>
      );
    case CourseStatus.Draft:
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          Draft
        </span>
      );
    case CourseStatus.Archived:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
          Archived
        </span>
      );
    default:
      return null;
  }
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { courses, summary } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8 flex items-center gap-3">
        <BarChart3 className="size-7 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Performance metrics across all of your courses
          </p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GraduationCap className="mb-4 size-12 text-muted-foreground/50" aria-hidden="true" />
          <h2 className="text-lg font-medium">No analytics yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Your dashboard will populate with enrollments, revenue, completion
            rates, and quiz scores once you create and publish courses.
          </p>
          <Link to="/instructor/new" className="mt-4">
            <Button>
              <Plus className="mr-2 size-4" />
              Create Course
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section aria-label="Portfolio summary">
            <h2 className="sr-only">Portfolio summary</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total enrollments"
                value={summary.totalEnrollments}
                sublabel={`Across ${courses.length} ${
                  courses.length === 1 ? "course" : "courses"
                }`}
                icon={<Users className="size-4" />}
              />
              <StatCard
                label="Total revenue"
                value={summary.totalRevenue}
                sublabel="Sum of amounts paid (PPP-adjusted)"
                icon={<DollarSign className="size-4" />}
              />
              <StatCard
                label="Completion rate"
                value={summary.completionRate}
                sublabel={`${summary.completedEnrollments} of ${summary.totalEnrollments} enrollments completed`}
                icon={<TrendingUp className="size-4" />}
              />
              <StatCard
                label="Avg. quiz score"
                value={summary.averageQuizScore}
                sublabel={`${summary.attemptCount} ${
                  summary.attemptCount === 1 ? "attempt" : "attempts"
                } across ${summary.quizCount} ${
                  summary.quizCount === 1 ? "quiz" : "quizzes"
                }`}
                icon={<Award className="size-4" />}
              />
            </div>
          </section>

          <section aria-label="Your courses">
            <h2 className="mb-3 text-lg font-semibold">Your courses</h2>
            <ul className="space-y-2">
              {courses.map((course) => (
                <li key={course.id}>
                  <Link
                    to={`/instructor/${course.id}`}
                    className="flex items-center justify-between rounded-md border border-border p-4 transition-colors hover:bg-accent"
                  >
                    <span className="font-medium">{course.title}</span>
                    {statusBadge(course.status)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading your analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to access this page.";
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
