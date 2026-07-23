import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Mail, Copy, Send, Trash2, Loader2, CheckCircle2, Clock } from "lucide-react";

interface Invite {
  id: number;
  email: string;
  name: string | null;
  role: string;
  token: string;
  invitedByEmail: string | null;
  acceptedAt: string | null;
  createdAt: string;
  inviteUrl: string;
}

async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export default function AdminInvitesPage() {
  const { data: invites, isLoading } = useQuery({
    queryKey: ["admin-invites"],
    queryFn: () => api<Invite[]>("/admin/invites"),
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-invites"] });

  const copy = (url: string, notify = true) => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => notify && toast({ title: "Invite link copied" }))
      .catch(() => {});
  };

  const create = useMutation({
    mutationFn: () =>
      api<{ invite: Invite; alreadyRegistered: boolean }>("/admin/invites", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null, role }),
      }),
    onSuccess: (r) => {
      toast({
        title: r.alreadyRegistered ? "Already has access" : "User invited",
        description: r.alreadyRegistered
          ? `${r.invite.email} already has an account.`
          : `${r.invite.email} can now sign in. Invite link copied.`,
      });
      setEmail("");
      setName("");
      invalidate();
      if (!r.alreadyRegistered) copy(r.invite.inviteUrl, false);
    },
    onError: (e: Error) => toast({ title: "Could not invite", description: e.message, variant: "destructive" }),
  });

  const resend = useMutation({
    mutationFn: (id: number) => api(`/admin/invites/${id}/resend`, { method: "POST" }),
    onSuccess: () => toast({ title: "Invite re-sent (if email is configured)" }),
    onError: (e: Error) => toast({ title: "Could not resend", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => api(`/admin/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Invite revoked" }); invalidate(); },
    onError: (e: Error) => toast({ title: "Could not revoke", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-foreground">Invitations</h1>
        <p className="text-muted-foreground mt-1">
          Access is invite-only. Add someone's email here and they can sign in with it; everyone else is blocked.
        </p>
      </div>

      {/* Invite form */}
      <Card className="shadow-sm mb-8">
        <CardContent className="p-5">
          <form
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) create.mutate(); }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 sm:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" placeholder="student@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name (optional)</Label>
              <Input id="inv-name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={!email.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Invite
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            An invite email is sent automatically once MSG91 email is configured. Until then, the invite link is copied for you to share.
          </p>
        </CardContent>
      </Card>

      <h2 className="text-lg font-serif font-semibold mb-3">
        Invited ({invites?.length ?? 0})
      </h2>
      <Card className="shadow-sm">
        <CardContent className="p-0 divide-y">
          {isLoading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : invites && invites.length > 0 ? (
            invites.map((inv) => (
              <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{inv.name || inv.email}</span>
                    <Badge variant="secondary" className="capitalize">{inv.role}</Badge>
                    {inv.acceptedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Joined</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" /> Pending</span>
                    )}
                  </div>
                  {inv.name && <div className="text-sm text-muted-foreground truncate">{inv.email}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => copy(inv.inviteUrl)} title="Copy invite link">
                    <Copy className="w-4 h-4" />
                  </Button>
                  {!inv.acceptedAt && (
                    <Button variant="ghost" size="sm" onClick={() => resend.mutate(inv.id)} disabled={resend.isPending} title="Resend email">
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => revoke.mutate(inv.id)} disabled={revoke.isPending} title="Revoke access">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <Mail className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">No invitations yet. Add someone above to give them access.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
