import { useState } from "react";
import { Link } from "wouter";
import { useGetCalendar, getGetCalendarQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameDay,
  isSameMonth,
  isToday,
  isAfter,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  FileText,
  MapPin,
  Video,
  Loader2,
} from "lucide-react";

type CalendarEvent = {
  key: string;
  date: Date;
  kind: "session" | "assignment";
  title: string;
  courseTitle: string;
  link: string | null;
  location?: string | null;
};

function isUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s);
}

export default function CalendarPage() {
  const { data, isLoading } = useGetCalendar({
    query: { queryKey: getGetCalendarQueryKey() },
  });
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());

  if (isLoading || !data) {
    return (
      <div className="p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mt-20" />
      </div>
    );
  }

  const events: CalendarEvent[] = [
    ...data.sessions.map((s) => ({
      key: `s-${s.id}`,
      date: new Date(s.startsAt),
      kind: "session" as const,
      title: s.title,
      courseTitle: s.courseTitle ?? "",
      link: null,
      location: s.location,
    })),
    ...data.assignments.map((a) => ({
      key: `a-${a.id}`,
      date: new Date(a.dueDate),
      kind: "assignment" as const,
      title: a.title,
      courseTitle: a.courseTitle,
      link: `/assignment/${a.id}`,
    })),
  ];

  const now = new Date();
  const upcomingSessions = data.sessions
    .filter((s) => isAfter(new Date(s.startsAt), now))
    .slice(0, 6);

  const rangeStart =
    view === "month"
      ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
      : startOfWeek(cursor, { weekStartsOn: 0 });
  const rangeEnd =
    view === "month"
      ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
      : endOfWeek(cursor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const goPrev = () =>
    setCursor(view === "month" ? subMonths(cursor, 1) : subWeeks(cursor, 1));
  const goNext = () =>
    setCursor(view === "month" ? addMonths(cursor, 1) : addWeeks(cursor, 1));

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Class sessions and assignment due dates across your courses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-4 py-1.5 text-sm font-medium capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-semibold">
                  {view === "month"
                    ? format(cursor, "MMMM yyyy")
                    : `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}`}
                </h2>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={goPrev}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goNext}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
                {days.map((day) => {
                  const dayEvents = events
                    .filter((e) => isSameDay(e.date, day))
                    .sort((a, b) => a.date.getTime() - b.date.getTime());
                  const muted = view === "month" && !isSameMonth(day, cursor);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`bg-card min-h-[92px] p-1.5 ${muted ? "opacity-40" : ""}`}
                    >
                      <div
                        className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                      >
                        {format(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((e) =>
                          e.link ? (
                            <Link
                              key={e.key}
                              href={e.link}
                              className="block text-[11px] leading-tight px-1.5 py-1 rounded truncate bg-accent/10 text-accent-foreground border border-accent/30 hover:bg-accent/20 transition-colors"
                              title={`${e.title} — ${e.courseTitle} (due ${format(e.date, "h:mm a")})`}
                            >
                              <FileText className="w-3 h-3 inline mr-0.5 -mt-px" />
                              {e.title}
                            </Link>
                          ) : (
                            <div
                              key={e.key}
                              className="text-[11px] leading-tight px-1.5 py-1 rounded truncate bg-primary/10 text-primary border border-primary/20"
                              title={`${e.title} — ${e.courseTitle} at ${format(e.date, "h:mm a")}`}
                            >
                              <CalendarClock className="w-3 h-3 inline mr-0.5 -mt-px" />
                              {format(e.date, "h:mm")} {e.title}
                            </div>
                          ),
                        )}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1.5">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-primary/10 border border-primary/20"></span>
                  Class session
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-accent/10 border border-accent/30"></span>
                  Assignment due
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-serif font-semibold mb-4">Upcoming classes</h2>
          <div className="space-y-3">
            {upcomingSessions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No classes scheduled yet.
                </CardContent>
              </Card>
            ) : (
              upcomingSessions.map((s) => (
                <Card key={s.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 shrink-0 text-center rounded-lg border bg-muted/30 py-1.5">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">
                          {format(new Date(s.startsAt), "MMM")}
                        </div>
                        <div className="text-lg font-bold leading-tight text-primary">
                          {format(new Date(s.startsAt), "d")}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{s.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{s.courseTitle}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(s.startsAt), "EEE, h:mm a")}
                          {s.endsAt ? ` – ${format(new Date(s.endsAt), "h:mm a")}` : ""}
                        </div>
                        {s.location &&
                          (isUrl(s.location) ? (
                            <a
                              href={s.location}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                            >
                              <Video className="w-3 h-3" /> Join link
                            </a>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {s.location}
                            </div>
                          ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
