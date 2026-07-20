import { useState, useRef, useEffect } from "react";
import {
  useUpdateAssignment,
  useListCourseStudents,
  useRequestUploadUrl,
  getListCourseStudentsQueryKey,
  getListAssignmentsQueryKey,
  getGetAssignmentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FileText, Link as LinkIcon, Video, Music, Loader2, Paperclip, X } from "lucide-react";

function toLocalInputValue(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditAssignmentDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const courseId: number = assignment.courseId;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed form state from the assignment each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle(assignment.title ?? "");
    setDescription(assignment.description ?? "");
    setDueDate(toLocalInputValue(assignment.dueDate));
    setMaxScore(assignment.maxScore ?? 100);
    setAllowedTypes(assignment.allowedTypes ?? []);
    setAttachments(assignment.attachments ?? []);
    const targets: string[] = assignment.targetStudentIds ?? [];
    setAudience(targets.length > 0 ? "selected" : "all");
    setTargetStudentIds(targets);
  }, [open, assignment]);

  const { data: roster } = useListCourseStudents(courseId, {
    query: { enabled: open && !!courseId, queryKey: getListCourseStudentsQueryKey(courseId) },
  });
  const updateAssignment = useUpdateAssignment();
  const requestUrl = useRequestUploadUrl();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleToggleType = (type: string) => {
    setAllowedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: { path: string; name: string }[] = [];
      for (const file of files) {
        const urlRes = await requestUrl.mutateAsync({
          data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" },
        });
        const putRes = await fetch(urlRes.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
        uploaded.push({ path: urlRes.objectPath, name: file.name });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || allowedTypes.length === 0) {
      toast({ title: "Validation Error", description: "Title and at least one submission type required.", variant: "destructive" });
      return;
    }
    if (uploading) {
      toast({ title: "Please wait", description: "Attachments are still uploading.", variant: "destructive" });
      return;
    }
    if (audience === "selected" && targetStudentIds.length === 0) {
      toast({ title: "No students selected", description: "Pick at least one student, or assign to all students.", variant: "destructive" });
      return;
    }

    updateAssignment.mutate(
      {
        assignmentId: assignment.id,
        data: {
          title,
          description: description || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          maxScore,
          allowedTypes: allowedTypes as any,
          attachments,
          targetStudentIds: audience === "selected" ? targetStudentIds : [],
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Assignment updated" });
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
          queryClient.invalidateQueries({ queryKey: getGetAssignmentQueryKey(assignment.id) });
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({ title: "Could not update assignment", description: err?.response?.data?.error || err?.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Edit Assignment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Assignment Title *</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-desc">Description / Instructions</Label>
            <Textarea id="edit-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            {attachments.length > 0 && (
              <ul className="space-y-2">
                {attachments.map((file, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-2 bg-muted/20">
                    <span className="flex items-center gap-2 truncate"><Paperclip className="w-4 h-4 text-muted-foreground shrink-0" /> {file.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Paperclip className="w-4 h-4 mr-2" />}
                {uploading ? "Uploading..." : "Attach Files"}
              </Button>
              <span className="text-xs text-muted-foreground">Any file type. Students can download these.</span>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-due">Due Date</Label>
              <Input id="edit-due" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-score">Max Score</Label>
              <Input id="edit-score" type="number" min="1" value={maxScore} onChange={(e) => setMaxScore(parseInt(e.target.value))} />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Allowed Submission Types *</Label>
            <div className="grid grid-cols-2 gap-3 p-4 border rounded-lg bg-muted/20">
              {[
                { id: "text", label: "Rich Text", icon: FileText },
                { id: "file", label: "File Upload", icon: FileText },
                { id: "link", label: "URL Link", icon: LinkIcon },
                { id: "video", label: "Video Recording", icon: Video },
                { id: "audio", label: "Audio Recording", icon: Music },
              ].map((type) => (
                <div key={type.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`edit-type-${type.id}`}
                    checked={allowedTypes.includes(type.id)}
                    onCheckedChange={() => handleToggleType(type.id)}
                  />
                  <Label htmlFor={`edit-type-${type.id}`} className="flex items-center gap-2 font-normal cursor-pointer">
                    <type.icon className="w-4 h-4 text-muted-foreground" />
                    {type.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Assign To</Label>
            <div className="border rounded-lg bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <input
                    type="radio"
                    name="edit-audience"
                    className="accent-primary"
                    checked={audience === "all"}
                    onChange={() => setAudience("all")}
                  />
                  All students
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <input
                    type="radio"
                    name="edit-audience"
                    className="accent-primary"
                    checked={audience === "selected"}
                    onChange={() => setAudience("selected")}
                  />
                  Select students
                </label>
              </div>
              {audience === "selected" && (
                roster && roster.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 border-t pt-3">
                    {roster.map((s: any) => (
                      <div key={s.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-target-${s.id}`}
                          checked={targetStudentIds.includes(s.id)}
                          onCheckedChange={() =>
                            setTargetStudentIds((prev) =>
                              prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                            )
                          }
                        />
                        <Label htmlFor={`edit-target-${s.id}`} className="font-normal cursor-pointer flex-1 truncate">
                          {s.name || s.email}
                          {s.name && <span className="text-muted-foreground ml-2 text-xs">{s.email}</span>}
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground border-t pt-3">No students enrolled yet.</p>
                )
              )}
              <p className="text-xs text-muted-foreground">
                {audience === "all"
                  ? "Every enrolled student will see this assignment."
                  : `Only the ${targetStudentIds.length} selected student${targetStudentIds.length === 1 ? "" : "s"} will see this assignment. Students who already submitted stay visible to you in the grading queue.`}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={updateAssignment.isPending || !title.trim() || allowedTypes.length === 0}>
              {updateAssignment.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
