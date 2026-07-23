import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetCoursePlan, useUpdateCoursePlan, getGetCoursePlanQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Lock, Unlock, CalendarDays, BookOpen, Briefcase, ClipboardList, Save, Clock,
} from "lucide-react";

type PlanItemDraft = {
  hourNumber: number;
  title: string;
  description: string;
  preWork: string;
  caseStudy: string;
  postWork: string;
};

const HOUR_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function CoursePlanView({ courseId, isTeacher }: { courseId: number; isTeacher: boolean }) {
  const { data: plan, isLoading } = useGetCoursePlan(courseId, {
    query: { enabled: !!courseId, queryKey: getGetCoursePlanQueryKey(courseId) },
  });

  if (isLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (!plan) return null;

  if (isTeacher) {
    return <TeacherPlanEditor courseId={courseId} plan={plan} />;
  }
  return <StudentPlanView plan={plan} />;
}

function dayOf(hour: number, hoursPerDay: number) {
  return Math.ceil(hour / hoursPerDay);
}

/* ---------------- Student view ---------------- */

function StudentPlanView({ plan }: { plan: any }) {
  const { totalHours, hoursPerDay, items } = plan;

  if (!totalHours || totalHours === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
          <CalendarDays className="w-12 h-12 text-muted mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No course plan yet</h3>
          <p className="max-w-sm">Your professor hasn't published an hour-wise plan for this course yet.</p>
        </CardContent>
      </Card>
    );
  }

  const totalDays = Math.ceil(totalHours / hoursPerDay);
  const itemsByHour = new Map<number, any>(items.map((i: any) => [i.hourNumber, i]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>{totalHours} hours across {totalDays} day{totalDays > 1 ? 's' : ''} ({hoursPerDay} hours/day). Locked days show topics only — details unlock when your professor opens them.</span>
      </div>
      {Array.from({ length: totalDays }, (_, d) => d + 1).map(day => {
        const dayHours = Array.from({ length: hoursPerDay }, (_, h) => (day - 1) * hoursPerDay + h + 1).filter(h => h <= totalHours);
        const dayLocked = dayHours.some(h => itemsByHour.get(h)?.locked);
        return (
          <Card key={day} className={`shadow-sm overflow-hidden ${dayLocked ? 'opacity-90' : ''}`}>
            <div className={`px-6 py-3 border-b flex items-center justify-between ${dayLocked ? 'bg-muted/40' : 'bg-primary/5'}`}>
              <h3 className="font-serif font-semibold text-lg">Day {day}</h3>
              {dayLocked && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                  <Lock className="w-3 h-3" /> Outline only
                </span>
              )}
            </div>
            <CardContent className="p-0 divide-y">
              {dayHours.map(hour => {
                const item = itemsByHour.get(hour);
                return (
                  <div key={hour} className="px-6 py-4 flex gap-4">
                    <div className="shrink-0 w-16 text-xs font-bold uppercase tracking-wider text-muted-foreground pt-1">Hour {hour}</div>
                    <div className="flex-1 min-w-0">
                      {item ? (
                        <>
                          <div className="font-medium">{item.title}</div>
                          {!item.locked && item.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{item.description}</p>}
                          {!item.locked && (item.preWork || item.caseStudy || item.postWork) && (
                            <div className="mt-3 grid gap-2">
                              {item.preWork && <WorkRow icon={BookOpen} label="Pre-work" text={item.preWork} />}
                              {item.caseStudy && <WorkRow icon={Briefcase} label="Case study" text={item.caseStudy} />}
                              {item.postWork && <WorkRow icon={ClipboardList} label="Post-work" text={item.postWork} />}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">To be announced</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function WorkRow({ icon: Icon, label, text }: { icon: any; label: string; text: string }) {
  return (
    <div className="flex gap-2 text-sm bg-muted/30 border rounded-lg px-3 py-2">
      <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div>
        <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mr-2">{label}</span>
        <span className="whitespace-pre-wrap">{text}</span>
      </div>
    </div>
  );
}

/* ---------------- Teacher editor ---------------- */

function TeacherPlanEditor({ courseId, plan }: { courseId: number; plan: any }) {
  const hoursPerDay = plan.hoursPerDay || 5;
  const [totalHours, setTotalHours] = useState<number>(plan.totalHours || 0);
  const [lockedDays, setLockedDays] = useState<number[]>(plan.lockedDays || []);
  const [drafts, setDrafts] = useState<Map<number, PlanItemDraft>>(new Map());
  const [dirty, setDirty] = useState(false);

  const updatePlan = useUpdateCoursePlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    // Don't clobber unsaved local edits with a background refetch.
    if (dirtyRef.current) return;
    const map = new Map<number, PlanItemDraft>();
    for (const item of plan.items || []) {
      map.set(item.hourNumber, {
        hourNumber: item.hourNumber,
        title: item.title || "",
        description: item.description || "",
        preWork: item.preWork || "",
        caseStudy: item.caseStudy || "",
        postWork: item.postWork || "",
      });
    }
    setDrafts(map);
    setTotalHours(plan.totalHours || 0);
    setLockedDays(plan.lockedDays || []);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, plan]);

  const totalDays = Math.ceil(totalHours / hoursPerDay);

  const setField = (hour: number, field: keyof PlanItemDraft, value: string) => {
    setDrafts(prev => {
      const next = new Map(prev);
      const existing = next.get(hour) || { hourNumber: hour, title: "", description: "", preWork: "", caseStudy: "", postWork: "" };
      next.set(hour, { ...existing, [field]: value });
      return next;
    });
    setDirty(true);
  };

  const toggleDayLock = (day: number) => {
    setLockedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    setDirty(true);
  };

  const handleSave = () => {
    const items = Array.from(drafts.values())
      .filter(d => d.hourNumber <= totalHours && d.title.trim())
      .map(d => ({
        hourNumber: d.hourNumber,
        title: d.title.trim(),
        description: d.description.trim() || undefined,
        preWork: d.preWork.trim() || undefined,
        caseStudy: d.caseStudy.trim() || undefined,
        postWork: d.postWork.trim() || undefined,
      }));

    updatePlan.mutate({
      courseId,
      data: { totalHours, lockedDays: lockedDays.filter(d => d <= totalDays), items },
    }, {
      onSuccess: () => {
        toast({ title: "Course plan saved", description: "Students will see the updated plan." });
        queryClient.invalidateQueries({ queryKey: getGetCoursePlanQueryKey(courseId) });
        setDirty(false);
      },
      onError: (err: any) => {
        toast({ title: "Couldn't save plan", description: err?.response?.data?.error || "Please try again.", variant: "destructive" });
      },
    });
  };

  const filledHours = useMemo(
    () => Array.from(drafts.values()).filter(d => d.hourNumber <= totalHours && d.title.trim()).length,
    [drafts, totalHours],
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardContent className="p-6 flex flex-wrap items-end gap-6">
          <div className="space-y-2">
            <Label htmlFor="total-hours">Course Duration</Label>
            <select
              id="total-hours"
              className="flex h-10 w-44 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={totalHours}
              onChange={e => { setTotalHours(parseInt(e.target.value, 10)); setDirty(true); }}
            >
              <option value={0}>No plan</option>
              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h} hours ({h / hoursPerDay} days)</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{hoursPerDay} teaching hours per day.</p>
          </div>
          <div className="flex-1 min-w-[200px] text-sm text-muted-foreground pb-1">
            {totalHours > 0 ? `${filledHours}/${totalHours} hours planned. Lock a day to show students only its topics until you unlock it.` : 'Choose a duration to start planning.'}
          </div>
          <Button onClick={handleSave} disabled={updatePlan.isPending || !dirty} className="ml-auto">
            {updatePlan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Plan
          </Button>
        </CardContent>
      </Card>

      {totalHours > 0 && Array.from({ length: totalDays }, (_, d) => d + 1).map(day => {
        const locked = lockedDays.includes(day);
        const dayHours = Array.from({ length: hoursPerDay }, (_, h) => (day - 1) * hoursPerDay + h + 1).filter(h => h <= totalHours);
        return (
          <Card key={day} className="shadow-sm overflow-hidden">
            <div className={`px-6 py-3 border-b flex items-center justify-between ${locked ? 'bg-muted/40' : 'bg-primary/5'}`}>
              <h3 className="font-serif font-semibold text-lg">Day {day}</h3>
              <div className="flex items-center gap-2">
                {locked ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Unlock className="w-4 h-4 text-primary" />}
                <Label htmlFor={`lock-${day}`} className="text-sm font-normal cursor-pointer">
                  {locked ? 'Locked — students see topics only' : 'Open — students see full details'}
                </Label>
                <Switch id={`lock-${day}`} checked={locked} onCheckedChange={() => toggleDayLock(day)} />
              </div>
            </div>
            <CardContent className="p-0 divide-y">
              {dayHours.map(hour => {
                const draft = drafts.get(hour);
                return (
                  <div key={hour} className="px-6 py-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-16 shrink-0">Hour {hour}</span>
                      <Input
                        placeholder="Topic for this hour (leave empty to skip)"
                        value={draft?.title || ""}
                        onChange={e => setField(hour, 'title', e.target.value)}
                      />
                    </div>
                    {(draft?.title || "").trim() && (
                      <div className="pl-0 md:pl-[76px] grid gap-3">
                        <Textarea rows={2} placeholder="What will be covered (visible to students)..." value={draft?.description || ""} onChange={e => setField(hour, 'description', e.target.value)} />
                        <div className="grid md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1"><BookOpen className="w-3 h-3" /> Pre-work</Label>
                            <Textarea rows={2} placeholder="Read/prepare before class..." value={draft?.preWork || ""} onChange={e => setField(hour, 'preWork', e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1"><Briefcase className="w-3 h-3" /> Case study</Label>
                            <Textarea rows={2} placeholder="Case to discuss in class..." value={draft?.caseStudy || ""} onChange={e => setField(hour, 'caseStudy', e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Post-work</Label>
                            <Textarea rows={2} placeholder="Follow-up after class..." value={draft?.postWork || ""} onChange={e => setField(hour, 'postWork', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
