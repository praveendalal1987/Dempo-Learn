import { Switch, Route, Redirect } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Shell } from "@/components/layout";

// Pages to import
import { LandingPage, SignInPage, SignUpPage, RolePickerPage } from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import CoursesPage from "@/pages/courses";
import CohortsPage from "@/pages/cohorts";
import JournalPage from "@/pages/journal";
import CourseViewPage from "@/pages/course-view";
import AssignmentViewPage from "@/pages/assignment-view";
import QuizViewPage from "@/pages/quiz-view";
import SubmissionViewPage from "@/pages/submission-view";
import MessagesPage from "@/pages/messages";
import CalendarPage from "@/pages/calendar";
import SettingsPage from "@/pages/settings";
import AdminLogsPage from "@/pages/admin-logs";
import AdminUsersPage from "@/pages/admin-users";
import OversightPage from "@/pages/oversight";
import CoordinatorPage from "@/pages/coordinator";
import FeedbackPage from "@/pages/feedback";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: user, isLoading } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  if (user && user.role === "unassigned" && rest.path !== "/role-picker") {
    return <Redirect to="/role-picker" />;
  }

  if (rest.adminOnly && user && !user.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  // Deans and coordinators have dedicated home pages instead of the
  // student/professor dashboard and course pages.
  if (user && rest.path === "/dashboard") {
    if (user.role === "dean") return <Redirect to="/oversight" />;
    if (user.role === "course_coordinator") return <Redirect to="/coordinator" />;
  }

  if (rest.roles && user && !rest.roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return <Component {...rest} />;
}

export function AppRouter() {
  return (
    <Shell>
      <Switch>
        {/* Public Routes */}
        <Route path="/" component={LandingPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />

        {/* Auth Required Routes */}
        <Route path="/role-picker">
          <ProtectedRoute component={RolePickerPage} path="/role-picker" />
        </Route>
        
        {/* Dashboard */}
        <Route path="/dashboard">
          <ProtectedRoute component={DashboardPage} path="/dashboard" />
        </Route>

        {/* Dean & Course Coordinator */}
        <Route path="/oversight">
          <ProtectedRoute component={OversightPage} roles={["dean"]} />
        </Route>
        <Route path="/coordinator">
          <ProtectedRoute component={CoordinatorPage} roles={["course_coordinator"]} />
        </Route>
        <Route path="/feedback">
          <ProtectedRoute
            component={FeedbackPage}
            roles={["dean", "course_coordinator", "teacher"]}
          />
        </Route>

        {/* Courses */}
        <Route path="/courses">
          <ProtectedRoute component={CoursesPage} />
        </Route>
        <Route path="/cohorts">
          <ProtectedRoute component={CohortsPage} />
        </Route>
        <Route path="/journal">
          <ProtectedRoute component={JournalPage} />
        </Route>
        <Route path="/course/:id">
          {params => <ProtectedRoute component={CourseViewPage} id={params.id} />}
        </Route>

        {/* Assignments & Submissions */}
        <Route path="/assignment/:id">
          {params => <ProtectedRoute component={AssignmentViewPage} id={params.id} />}
        </Route>
        <Route path="/quiz/:id">
          {params => <ProtectedRoute component={QuizViewPage} id={params.id} />}
        </Route>
        <Route path="/submission/:id">
          {params => <ProtectedRoute component={SubmissionViewPage} id={params.id} />}
        </Route>

        {/* Calendar */}
        <Route path="/calendar">
          <ProtectedRoute component={CalendarPage} />
        </Route>

        {/* Messages */}
        <Route path="/messages">
          <ProtectedRoute component={MessagesPage} />
        </Route>

        {/* Admin */}
        <Route path="/admin/users">
          <ProtectedRoute component={AdminUsersPage} adminOnly />
        </Route>
        <Route path="/admin/logs">
          <ProtectedRoute component={AdminLogsPage} adminOnly />
        </Route>

        {/* Settings */}
        <Route path="/settings">
          <ProtectedRoute component={SettingsPage} />
        </Route>

        {/* Catch-all */}
        <Route>
          <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
            <h1 className="text-6xl font-serif text-primary mb-4">404</h1>
            <h2 className="text-2xl font-medium text-foreground mb-2">Page not found</h2>
            <p className="text-muted-foreground mb-8">The page you are looking for doesn't exist or has been moved.</p>
            <a href="/dashboard" className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium">
              Go Home
            </a>
          </div>
        </Route>
      </Switch>
    </Shell>
  );
}
