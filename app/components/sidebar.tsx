import { NavLink, Form, useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { UserAvatar } from "~/components/user-avatar";
import {
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  ChartColumn,
  Shield,
  Tag,
  Users,
  UsersRound,
  Moon,
  Sun,
  LogOut,
  Settings,
  Bell,
} from "lucide-react";

interface CurrentUser {
  id: number;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

interface RecentCourse {
  courseId: number;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  completedLessons: number;
  totalLessons: number;
  progress: number;
}

interface NotificationItem {
  id: number;
  courseTitle: string;
  actorName: string;
  readAt: string | null;
  createdAt: string;
}

interface SidebarProps {
  currentUser: CurrentUser | null;
  recentCourses?: RecentCourse[];
  isTeamAdmin?: boolean;
  unreadNotificationCount?: number;
  notifications?: NotificationItem[];
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: UserRole[] | "all";
}

const navItems: NavItem[] = [
  {
    label: "Browse Courses",
    to: "/courses",
    icon: <BookOpen className="size-4" />,
    roles: "all",
  },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
    roles: [UserRole.Student],
  },
  {
    label: "My Courses",
    to: "/instructor",
    icon: <GraduationCap className="size-4" />,
    roles: [UserRole.Instructor],
  },
  {
    label: "Analytics",
    to: "/instructor/analytics",
    icon: <ChartColumn className="size-4" />,
    roles: [UserRole.Instructor],
  },
  {
    label: "Manage Users",
    to: "/admin/users",
    icon: <Users className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Manage Courses",
    to: "/admin/courses",
    icon: <Shield className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Categories",
    to: "/admin/categories",
    icon: <Tag className="size-4" />,
    roles: [UserRole.Admin],
  },
];

function isVisible(item: NavItem, role: UserRole | null): boolean {
  if (item.roles === "all") return true;
  if (!role) return false;
  return item.roles.includes(role);
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function NotificationsMenu({
  unreadCount,
  notifications,
}: {
  unreadCount: number;
  notifications: NotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  const containerRef = useRef<HTMLDivElement>(null);

  // Opening the menu is "viewing" — mark everything read so the badge clears.
  useEffect(() => {
    if (open && unreadCount > 0 && fetcher.state === "idle") {
      fetcher.submit(
        { intent: "mark-all-read" },
        { method: "post", action: "/api/notifications" }
      );
    }
    // Only react to the menu opening, not to fetcher identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close when clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        {unreadCount > 0 && (
          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-sidebar-border bg-sidebar shadow-lg">
          <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Notifications
            </span>
            {notifications.some((n) => n.readAt === null) && (
              <fetcher.Form method="post" action="/api/notifications">
                <input type="hidden" name="intent" value="mark-all-read" />
                <button
                  type="submit"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              </fetcher.Form>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-sidebar-foreground/50">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "border-b border-sidebar-border/50 px-3 py-2 text-sm last:border-b-0",
                    n.readAt === null && "bg-sidebar-accent/50"
                  )}
                >
                  <p className="text-sidebar-foreground">
                    <span className="font-medium">{n.actorName}</span> enrolled
                    in <span className="font-medium">{n.courseTitle}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-sidebar-foreground/50">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  currentUser,
  recentCourses = [],
  isTeamAdmin = false,
  unreadNotificationCount = 0,
  notifications = [],
}: SidebarProps) {
  const currentUserRole = currentUser?.role ?? null;
  const showNotifications = currentUserRole === UserRole.Instructor;
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <NavLink to="/" className="text-lg font-bold tracking-tight">
          Cadence
        </NavLink>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems
          .filter((item) => isVisible(item, currentUserRole))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        {showNotifications && (
          <NotificationsMenu
            unreadCount={unreadNotificationCount}
            notifications={notifications}
          />
        )}
        {isTeamAdmin && (
          <NavLink
            to="/team"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <UsersRound className="size-4" />
            Team
          </NavLink>
        )}
      </nav>

      {recentCourses.length > 0 && (
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Recent Courses
          </div>
          <div className="space-y-1">
            {recentCourses.map((course) => (
              <NavLink
                key={course.courseId}
                to={`/courses/${course.slug}`}
                className={({ isActive }) =>
                  cn(
                    "block rounded-md px-3 py-2 transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <div className="truncate text-sm font-medium">
                  {course.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-sidebar-accent">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-sidebar-foreground/50">
                    {course.progress}%
                  </span>
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={toggleDarkMode}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>

        {currentUser && (
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <UserAvatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">
                {currentUser.name}
              </div>
              <div className="truncate text-xs capitalize text-sidebar-foreground/50">
                {currentUser.role}
              </div>
            </div>
            <NavLink
              to="/settings"
              title="Settings"
              className="rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Settings className="size-4" />
            </NavLink>
            <Form method="post" action="/api/logout">
              <button
                type="submit"
                title="Sign out"
                className="rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </Form>
          </div>
        )}
      </div>
    </aside>
  );
}
