import { MessageSquare, Trophy, Clock, CalendarDays, CheckCircle } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { useGetMe, useUpdateMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, BookOpen, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { LandingHero } from "@/components/landing-hero";

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Gradient background matching the landing hero */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 dark:from-violet-900 dark:via-fuchsia-900 dark:to-orange-800" />
      {/* Soft blobs for depth */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-300/30 dark:bg-cyan-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-24 w-[30rem] h-[30rem] rounded-full bg-pink-300/30 dark:bg-pink-500/20 blur-3xl" />

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center px-4">
        <Link href="/" className="flex flex-col items-center">
          <img src={import.meta.env.BASE_URL + "logo.png"} alt="Dempo Learn" className="w-16 h-16 mb-4 drop-shadow-md" />
        </Link>
        <h2 className="mt-2 text-center text-3xl sm:text-4xl font-serif font-bold text-white drop-shadow-sm">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-center text-sm text-white/90 drop-shadow-sm">
            {subtitle}
          </p>
        )}
      </div>
      <div className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md flex justify-center px-4">
        {children}
      </div>
    </div>
  );
}

export function SignInPage() {
  return (
    <AuthShell title="Welcome back to Dempo" subtitle="School hits different once you're in. ✨">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </AuthShell>
  );
}

export function SignUpPage() {
  return (
    <AuthShell title="Join the fun" subtitle="Create your account — it's free.">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </AuthShell>
  );
}

export function RolePickerPage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const updateMe = useUpdateMe();

  useEffect(() => {
    if (user && user.role !== "unassigned") {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user.role !== "unassigned") {
    return null; // will redirect in effect
  }

  const handleSelectRole = (role: "student") => {
    updateMe.mutate({ data: { role } }, {
      onSuccess: () => {
        setLocation("/dashboard");
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center text-center px-4">
        <img src={import.meta.env.BASE_URL + "logo.png"} alt="Dempo Learn" className="w-16 h-16 mb-6" />
        <h1 className="text-4xl font-serif font-bold text-foreground mb-3">
          Welcome to Dempo Learn
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mb-12">
          Let's set you up as a student — join courses, submit assignments, and track your grades and feedback.
        </p>

        <div className="w-full">
          <Card className="hover:border-primary cursor-pointer transition-all hover:shadow-md relative overflow-hidden group" onClick={() => handleSelectRole("student")}>
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6" />
              </div>
              <CardTitle className="font-serif text-2xl">Continue as Student</CardTitle>
              <CardDescription className="text-base mt-2">
                Join courses, submit assignments, and view grades and feedback.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex justify-center">
              <Button disabled={updateMe.isPending} className="w-full">
                {updateMe.isPending ? "Setting up…" : "Get started"}
              </Button>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground mt-6">
            Teaching on Dempo? Your administrator will set up your educator account.
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setLocation("/dashboard");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || isSignedIn) return null;

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-2">
          <img src={import.meta.env.BASE_URL + "logo.png"} alt="Dempo Learn Logo" className="w-10 h-10" />
          <span className="font-serif font-bold text-2xl text-white drop-shadow-sm">Dempo Learn</span>
        </div>
        <div className="flex gap-4">
          <Link href="/sign-in" className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold transition-colors bg-white text-fuchsia-600 hover:bg-white/90 rounded-full shadow-sm">
            Sign In
          </Link>
        </div>
      </header>

      <main>
        <LandingHero />

        {/* Student Dashboard Preview */}
        <section className="py-24 px-6 sm:px-12 lg:px-20 bg-muted/40">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <div className="inline-block mb-4 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                Student Dashboard Preview
              </div>
              <h2 className="text-4xl sm:text-5xl font-serif font-bold text-foreground tracking-tight mb-4">
                Everything a student needs, <span className="text-primary italic font-normal">at a glance.</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Grades, feedback, deadlines, and class standings — organized into one calm, focused home base.
              </p>
            </div>

            <div className="relative max-w-5xl mx-auto">
              {/* Callouts */}
              <div className="hidden xl:flex absolute left-0 -translate-x-full top-[150px] z-10 items-center gap-2 pr-0">
                <div className="bg-card border border-border shadow-lg rounded-lg px-4 py-2.5">
                  <div className="text-sm font-semibold text-foreground">Overall score</div>
                  <div className="text-xs text-muted-foreground">Live average per course</div>
                </div>
                <div className="w-8 h-px bg-border" />
              </div>
              <div className="hidden xl:flex absolute right-0 translate-x-full top-[320px] z-10 items-center gap-2">
                <div className="w-8 h-px bg-border" />
                <div className="bg-card border border-border shadow-lg rounded-lg px-4 py-2.5">
                  <div className="text-sm font-semibold text-foreground">Feedback</div>
                  <div className="text-xs text-muted-foreground">Professor comments, instantly</div>
                </div>
              </div>
              <div className="hidden xl:flex absolute left-0 -translate-x-full bottom-24 z-10 items-center gap-2">
                <div className="bg-card border border-border shadow-lg rounded-lg px-4 py-2.5">
                  <div className="text-sm font-semibold text-foreground">Submissions</div>
                  <div className="text-xs text-muted-foreground">Every hand-in, tracked</div>
                </div>
                <div className="w-8 h-px bg-border" />
              </div>

              {/* Browser frame */}
              <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/60">
                  <span className="w-3 h-3 rounded-full bg-red-400/70" />
                  <span className="w-3 h-3 rounded-full bg-amber-400/70" />
                  <span className="w-3 h-3 rounded-full bg-green-400/70" />
                  <div className="ml-4 flex-1 max-w-sm h-6 rounded-md bg-background border border-border text-[11px] text-muted-foreground flex items-center px-3">
                    dempolearn.app/dashboard
                  </div>
                </div>

                {/* Mock dashboard */}
                <div className="p-6 sm:p-8 space-y-6 bg-background text-left">
                  <div>
                    <div className="text-xl sm:text-2xl font-serif font-bold text-foreground">Welcome back, Maya</div>
                    <div className="text-sm text-muted-foreground">Here is your overview for today.</div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Overall Score", value: "92%", accent: true },
                      { label: "Courses", value: "3" },
                      { label: "Due Soon", value: "2" },
                      { label: "Class Rank", value: "#2" },
                    ].map((stat) => (
                      <div key={stat.label} className={`rounded-lg border p-3 sm:p-4 ${stat.accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                        <div className="text-[11px] sm:text-xs text-muted-foreground">{stat.label}</div>
                        <div className={`text-xl sm:text-2xl font-bold ${stat.accent ? "text-primary" : "text-foreground"}`}>{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Submissions & feedback */}
                    <div className="rounded-lg border border-border bg-card">
                      <div className="px-4 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        Recent Submissions & Feedback
                      </div>
                      <div className="divide-y divide-border">
                        {[
                          { title: "Case Study: Market Entry", score: "18/20", feedback: true },
                          { title: "Presentation Recording", score: "9/10", feedback: true },
                          { title: "Weekly Reflection #6", score: null, feedback: false },
                        ].map((sub) => (
                          <div key={sub.title} className="px-4 py-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{sub.title}</div>
                              {sub.feedback && (
                                <div className="text-[11px] text-primary flex items-center gap-1 mt-0.5">
                                  <MessageSquare className="w-3 h-3" /> Feedback available
                                </div>
                              )}
                            </div>
                            {sub.score ? (
                              <span className="text-xs font-semibold text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950 px-2 py-1 rounded shrink-0">{sub.score}</span>
                            ) : (
                              <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded shrink-0">Awaiting grade</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Due soon + classes */}
                      <div className="rounded-lg border border-border bg-card">
                        <div className="px-4 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
                          <Clock className="w-4 h-4 text-accent" />
                          Due Soon
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <div className="text-sm font-medium">Negotiation Roleplay Video</div>
                          <span className="text-[11px] text-accent font-medium">Due Thu, 5:00 PM</span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-card">
                        <div className="px-4 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-amber-500" />
                          Leaderboard
                        </div>
                        <div className="divide-y divide-border">
                          {[
                            { rank: 1, name: "J. Okafor", score: "95%" },
                            { rank: 2, name: "You", score: "92%", me: true },
                            { rank: 3, name: "L. Chen", score: "89%" },
                          ].map((e) => (
                            <div key={e.rank} className={`px-4 py-2 flex items-center gap-3 ${e.me ? "bg-primary/5" : ""}`}>
                              <span className="w-5 text-xs font-bold text-muted-foreground">#{e.rank}</span>
                              <span className={`text-sm flex-1 ${e.me ? "font-semibold text-primary" : "font-medium"}`}>{e.name}</span>
                              <span className="text-sm font-bold">{e.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-2 text-sm">
                        <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium">Next class:</span>
                        <span className="text-muted-foreground truncate">Wed 10:00 AM · Room 204</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile callouts */}
              <div className="xl:hidden mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                {[
                  ["Overall score", "Live average per course"],
                  ["Feedback", "Professor comments, instantly"],
                  ["Submissions", "Every hand-in, tracked"],
                ].map(([t, d]) => (
                  <div key={t} className="bg-card border border-border rounded-lg px-4 py-3">
                    <div className="text-sm font-semibold text-foreground">{t}</div>
                    <div className="text-xs text-muted-foreground">{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-24 overflow-hidden bg-slate-50 dark:bg-slate-950">
          {/* Soft ambient blobs echoing the hero */}
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-fuchsia-300/20 dark:bg-fuchsia-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-violet-300/20 dark:bg-violet-500/10 blur-3xl pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 sm:px-12 lg:px-20">
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 dark:from-violet-400/15 dark:to-fuchsia-400/15 text-fuchsia-600 dark:text-fuchsia-400 text-sm font-semibold border border-fuchsia-500/20 mb-5">
                ✨ The good stuff
              </span>
              <h2 className="text-4xl sm:text-5xl font-serif font-bold text-slate-900 dark:text-white tracking-tight">
                Why everyone's{" "}
                <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">
                  obsessed
                </span>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="group rounded-3xl p-8 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-white/10 shadow-lg shadow-violet-500/5 hover:shadow-xl hover:shadow-violet-500/15 hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-serif font-bold mb-3 text-slate-900 dark:text-white">Grades at warp speed ⚡</h3>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  AI drafts the grades and feedback, professors hit approve. Half the grading time, way faster feedback for you.
                </p>
              </div>
              <div className="group rounded-3xl p-8 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-white/10 shadow-lg shadow-fuchsia-500/5 hover:shadow-xl hover:shadow-fuchsia-500/15 hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-orange-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-serif font-bold mb-3 text-slate-900 dark:text-white">Submit literally anything 🎬</h3>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Text, files, links — or hit record and drop a video or voice note right in the browser. Main-character energy, every assignment.
                </p>
              </div>
              <div className="group rounded-3xl p-8 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-white/10 shadow-lg shadow-orange-500/5 hover:shadow-xl hover:shadow-orange-500/15 hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-serif font-bold mb-3 text-slate-900 dark:text-white">DMs, not dead emails 💬</h3>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Message your professor right where the work happens. No lost emails, no scattered feedback — just answers.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
