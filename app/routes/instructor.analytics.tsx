import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCoursesByInstructor } from "~/services/courseService";
import { getInstructorAnalyticsSummary } from "~/services/instructorAnalyticsService";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  AlertTriangle,
  Award,
  ChartColumn,
  DollarSign,
  GraduationCap,
  Users,
} from "lucide-react";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    {
      name: "description",
      content: "Performance analytics across your courses",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
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

  // All analytics are scoped to courses the signed-in instructor owns.
  const ownedCourses = getCoursesByInstructor(currentUserId);
  const summary = getInstructorAnalyticsSummary(currentUserId);

  // Shape into a serialisable, already-formatted view object so the component
  // stays presentational.
  return {
    courseCount: ownedCourses.length,
    summary: {
      totalEnrollments: summary.totalEnrollments,
      totalRevenue: formatPrice(summary.totalRevenue),
      completionRate: `${Math.round(summary.completionRate)}%`,
      averageQuizScore: `${Math.round(summary.averageQuizScore)}%`,
      attemptCount: summary.attemptCount,
      distinctQuizCount: summary.distinctQuizCount,
    },
  };
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  hint?: string;
}

function StatCard({ label, value, icon, hint }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { courseCount, summary } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <ChartColumn className="size-7" />
          Analytics
        </h1>
        <p className="mt-1 text-muted-foreground">
          Performance across all of your courses at a glance.
        </p>
      </div>

      {courseCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="mb-4 size-12 text-muted-foreground/50" />
            <h2 className="text-lg font-medium">No analytics yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              This dashboard will populate with enrollments, revenue, and quiz
              metrics once you create and publish courses.
            </p>
            <Link to="/instructor/new" className="mt-4">
              <Button>Create your first course</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Portfolio summary */}
          <section aria-label="Portfolio summary">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total enrollments"
                value={summary.totalEnrollments}
                icon={<Users className="size-4" />}
                hint={`Across ${courseCount} ${
                  courseCount === 1 ? "course" : "courses"
                }`}
              />
              <StatCard
                label="Total revenue"
                value={summary.totalRevenue}
                icon={<DollarSign className="size-4" />}
                hint="Sum of amounts paid (PPP-adjusted)"
              />
              <StatCard
                label="Completion rate"
                value={summary.completionRate}
                icon={<GraduationCap className="size-4" />}
                hint="Enrolled students who finished"
              />
              <StatCard
                label="Avg. quiz score"
                value={summary.averageQuizScore}
                icon={<Award className="size-4" />}
                hint={
                  summary.attemptCount === 0
                    ? "No quiz attempts yet"
                    : `${summary.attemptCount} ${
                        summary.attemptCount === 1 ? "attempt" : "attempts"
                      } across ${summary.distinctQuizCount} ${
                        summary.distinctQuizCount === 1 ? "quiz" : "quizzes"
                      }`
                }
              />
            </div>
          </section>

          {/* Per-course breakdown (#16) and time-series graphs (#17) are filled
              in by subsequent slices. */}
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
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
