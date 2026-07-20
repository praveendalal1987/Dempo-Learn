import { useState } from "react";
import {
  useListClassSessions,
  getListClassSessionsQueryKey,
  useCreateClassSession,
  useUpdateClassSession,
  useDeleteClassSession,
  getGetCalendarQueryKey,
  type ClassSession,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, isPast } from "date-fns";
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MapPin,
  Video,
} from "lucide-react";

function isUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s);
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CourseSchedule({
  courseId,
  isTeacher,
}: {
  courseId: number;
  isTeacher: boolean;
}) {
  const { data: sessions, isLoading } = useListClassSessions(courseId, {
    query: { enabled: !!courseId, queryKey: getListClassSessionsQueryKey(courseId) },
  });
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ClassSession | null>(null);
  const deleteSession = useDeleteClassSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListClassSessionsQueryKey(courseId) });
    queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    deleteSession.mutate(
      { sessionId: toDelete.id },
      {
        onSuccess: () => {
          toast({ title: "Session deleted" });
          refresh();
          setToDelete(null);
        },
        onError: (err: any) => {
          toast({ title: "Could not delete session", description: err?.message, variant: "destructive" });
          setToDelete(null);
        },
      },
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mt-10" /></div>;
  }

  const upcoming = (sessions ?? []).filter((s) => !isPast(new Date(s.startsAt)));
  const past = (sessions ?? []).filter((s) => isPast(new Date(s.startsAt)));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-serif font-semibold">Class Schedule</h2>
        {isTeacher && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> Schedule Class
          </Button>
        )}
      </div>

      {(sessions ?? []).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <CalendarClock className="w-12 h-12 text-muted mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No classes scheduled</h3>
            <p className="max-w-sm">
              {isTeacher
                ? "Schedule your first class session so students know when to show up."
                : "Your professor hasn't scheduled any class sessions yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {[{ label: "Upcoming", list: upcoming }, { label: "Past", list: past }].map(
            ({ label, list }) =>
              list.length > 0 && (
                <div key={label}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {label} ({list.length})
                  </h3>
                  <div className="space-y-3">
                    {list.map((s) => (
                      <Card key={s.id} className={`shadow-sm ${label === "Past" ? "opacity-60" : ""}`}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-12 shrink-0 text-center rounded-lg border bg-muted/30 py-2">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">
                              {format(new Date(s.startsAt), "MMM")}
                            </div>
                            <div className="text-xl font-bold leading-tight text-primary">
                              {format(new Date(s.startsAt), "d")}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{s.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(s.startsAt), "EEEE, MMM d · h:mm a")}
                              {s.endsAt ? ` – ${format(new Date(s.endsAt), "h:mm a")}` : ""}
                            </div>
                            {s.location &&
                              (isUrl(s.location) ? (
                                <a href={s.location} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1 mt-0.5">
                                  <Video className="w-3.5 h-3.5" /> Meeting link
                                </a>
                              ) : (
                                <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3.5 h-3.5" /> {s.location}
                                </div>
                              ))}
                          </div>
                          {isTeacher && (
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setEditing(s)} title="Edit session">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => setToDelete(s)} title="Delete session">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ),
          )}
        </>
      )}

      {isTeacher && (creating || editing) && (
        <SessionDialog
          courseId={courseId}
          session={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { refresh(); setCreating(false); setEditing(null); }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this class session?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `"${toDelete.title}" will be removed from the schedule and students' calendars.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSession.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleteSession.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSession.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SessionDialog({
  courseId,
  session,
  onClose,
  onSaved,
}: {
  courseId: number;
  session: ClassSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(session?.title ?? "");
  const [startsAt, setStartsAt] = useState(
    session ? toLocalInputValue(new Date(session.startsAt)) : "",
  );
  const [endsAt, setEndsAt] = useState(
    session?.endsAt ? toLocalInputValue(new Date(session.endsAt)) : "",
  );
  const [location, setLocation] = useState(session?.location ?? "");
  const createSession = useCreateClassSession();
  const updateSession = useUpdateClassSession();
  const { toast } = useToast();
  const isPending = createSession.isPending || updateSession.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) {
      toast({ title: "Validation error", description: "Title and start time are required.", variant: "destructive" });
      return;
    }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast({ title: "Validation error", description: "End time must be after start time.", variant: "destructive" });
      return;
    }
    const data = {
      title: title.trim(),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      location: location.trim() || null,
    };
    const opts = {
      onSuccess: () => {
        toast({ title: session ? "Session updated" : "Class scheduled" });
        onSaved();
      },
      onError: (err: any) => {
        toast({ title: "Could not save session", description: err?.message, variant: "destructive" });
      },
    };
    if (session) {
      updateSession.mutate({ sessionId: session.id, data }, opts);
    } else {
      createSession.mutate({ courseId, data }, opts);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {session ? "Edit Class Session" : "Schedule a Class"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label htmlFor="session-title">Title *</Label>
            <Input id="session-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3 — Live lecture" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="session-start">Starts *</Label>
              <Input id="session-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-end">Ends</Label>
              <Input id="session-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-location">Link or location</Label>
            <Input id="session-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://meet.example.com/... or Room 204" />
            <p className="text-xs text-muted-foreground">Paste a meeting URL or type a physical location. Optional.</p>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending || !title.trim() || !startsAt}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {session ? "Save Changes" : "Schedule Class"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
