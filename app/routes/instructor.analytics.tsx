import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCoursesByInstructor } from "~/services/courseService";
import {
  getInstructorAnalyticsSummary,
  getPerCourseAnalytics,
  getEnrollmentsOverTime,
  getRevenueOverTime,
} from "~/services/instructorAnalyticsService";
import { TimeSeriesChart } from "~/components/time-series-chart";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { CourseStatus, UserRole } from "~/db/schema";
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
  const perCourse = getPerCourseAnalytics(currentUserId);
  const enrollmentsOverTime = getEnrollmentsOverTime(currentUserId);
  const revenueOverTime = getRevenueOverTime(currentUserId);

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
    perCourse: perCourse.map((c) => ({
      courseId: c.courseId,
      title: c.title,
      status: c.status,
      enrollments: c.totalEnrollments,
      revenue: formatPrice(c.revenue),
      completionRate: `${Math.round(c.completionRate)}%`,
      averageQuizScore:
        c.attemptCount === 0 ? "—" : `${Math.round(c.averageQuizScore)}%`,
      passRate: c.attemptCount === 0 ? "—" : `${Math.round(c.passRate)}%`,
      attemptCount: c.attemptCount,
    })),
    // Charts need numeric values to plot; keep cents/counts raw and format on
    // the axis/tooltip in the chart component.
    enrollmentsOverTime: enrollmentsOverTime.map((b) => ({
      date: b.date,
      value: b.count,
    })),
    revenueOverTime: revenueOverTime.map((b) => ({
      date: b.date,
      value: b.revenue,
    })),
  };
}

/** Compact currency formatter for chart axes/tooltips (input is cents). */
function formatRevenueAxis(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function StatusBadge({ status }: { status: CourseStatus }) {
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
  const { courseCount, summary, perCourse, enrollmentsOverTime, revenueOverTime } =
    loaderData;

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

          {/* Per-course breakdown */}
          <section aria-label="Per-course breakdown">
            <h2 className="mb-3 text-lg font-semibold">Courses</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <caption className="sr-only">
                      Per-course breakdown of enrollments, revenue, completion
                      rate, and quiz performance
                    </caption>
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          Course
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          Enrollments
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          Revenue
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          Completion
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          Avg. Quiz
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          Pass Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {perCourse.map((course) => (
                        <tr
                          key={course.courseId}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/instructor/${course.courseId}`}
                                className="text-sm font-medium hover:text-primary hover:underline"
                              >
                                {course.title}
                              </Link>
                              <StatusBadge status={course.status} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {course.enrollments}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {course.revenue}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {course.completionRate}
                          </td>
                          <td
                            className="px-4 py-3 text-right text-sm"
                            title={
                              course.attemptCount === 0
                                ? "No quiz attempts yet"
                                : `${course.attemptCount} ${
                                    course.attemptCount === 1
                                      ? "attempt"
                                      : "attempts"
                                  }`
                            }
                          >
                            {course.averageQuizScore}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {course.passRate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Time-series graphs */}
          <section aria-label="Trends over time">
            <h2 className="mb-3 text-lg font-semibold">Over time</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="size-4" />
                    Enrollments over time
                  </div>
                  <TimeSeriesChart
                    data={enrollmentsOverTime}
                    label="Enrollments over time"
                    seriesName="Enrollments"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <DollarSign className="size-4" />
                    Revenue over time
                  </div>
                  <TimeSeriesChart
                    data={revenueOverTime}
                    label="Revenue over time"
                    seriesName="Revenue"
                    formatValue={formatRevenueAxis}
                    color="var(--color-chart-2, #22c55e)"
                  />
                </CardContent>
              </Card>
            </div>
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
