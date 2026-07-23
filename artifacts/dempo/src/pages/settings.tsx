import { useEffect, useState } from "react";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const { data: user } = useGetMe();
  const isTeacher = user?.role === "teacher";

  return (
    <div className="p-8 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences.</p>
      </div>

      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-serif">Profile</CardTitle>
            <CardDescription>Your personal information as it appears to others in your courses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="w-20 h-20 border-2">
                <AvatarImage src={user?.avatarUrl || ''} />
                <AvatarFallback className="text-2xl bg-primary/5 text-primary">
                  {user?.name?.charAt(0) || <UserCircle className="w-8 h-8" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg">{user?.name}</h3>
                <p className="text-muted-foreground capitalize flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                  {user?.role === "teacher" ? "Professor" : user?.role} Account
                </p>
                <div className="mt-2 text-xs text-muted-foreground border px-2 py-1 rounded inline-block bg-muted/50">
                  Name, email & avatar managed by Clerk
                </div>
              </div>
            </div>

            <div className="grid gap-4 pt-4 border-t">
              <div>
                <Label className="text-muted-foreground">Email Address</Label>
                <div className="font-medium mt-1">{user?.email}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">Account ID</Label>
                <div className="font-mono text-xs mt-1 text-muted-foreground bg-muted p-2 rounded break-all">{user?.id}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isTeacher && <TeacherProfileForm user={user} />}
      </div>
    </div>
  );
}

function TeacherProfileForm({ user }: { user: any }) {
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      setTitle(user.title || "");
      setBio(user.bio || "");
      setLinkedinUrl(user.linkedinUrl || "");
    }
  }, [user?.id]);

  const validateLinkedin = (value: string): string | null => {
    const raw = value.trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        /(^|\.)linkedin\.com$/i.test(url.hostname)
      ) {
        return null;
      }
    } catch {
      // fall through
    }
    return "Enter a valid LinkedIn URL, e.g. https://www.linkedin.com/in/your-name";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateLinkedin(linkedinUrl);
    setLinkedinError(err);
    if (err) return;

    updateMe.mutate(
      { data: { title: title.trim() || null, bio: bio.trim() || null, linkedinUrl: linkedinUrl.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Profile saved", description: "Students will see your updated profile." });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (error: any) => {
          const message = error?.response?.data?.error || "Could not save your profile. Please try again.";
          toast({ title: "Save failed", description: message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="font-serif">Professor Profile</CardTitle>
        <CardDescription>Tell students about yourself. This is shown when they view your profile from a course.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="profile-title">Title / Headline</Label>
            <Input
              id="profile-title"
              placeholder="e.g. Professor of Computer Science"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              rows={5}
              placeholder="Share your background, teaching philosophy, or anything students should know."
              value={bio}
              maxLength={2000}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-linkedin">LinkedIn Profile URL</Label>
            <Input
              id="profile-linkedin"
              placeholder="https://www.linkedin.com/in/your-name"
              value={linkedinUrl}
              onChange={(e) => {
                setLinkedinUrl(e.target.value);
                if (linkedinError) setLinkedinError(null);
              }}
              aria-invalid={!!linkedinError}
              className={linkedinError ? "border-destructive" : undefined}
            />
            {linkedinError && <p className="text-sm text-destructive">{linkedinError}</p>}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button type="submit" disabled={updateMe.isPending} className="mt-4">
              {updateMe.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
