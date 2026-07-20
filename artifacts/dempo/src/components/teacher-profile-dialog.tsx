import { useGetTeacherProfile, getGetTeacherProfileQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Linkedin } from "lucide-react";

export function TeacherProfileDialog({
  teacherId,
  open,
  onOpenChange,
}: {
  teacherId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: profile, isLoading } = useGetTeacherProfile(teacherId, {
    query: { enabled: open && !!teacherId, queryKey: getGetTeacherProfileQueryKey(teacherId) },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-serif">Professor Profile</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          </div>
        ) : profile ? (
          <div className="pt-2 space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-2">
                <AvatarImage src={profile.avatarUrl || ""} />
                <AvatarFallback className="text-xl bg-primary/5 text-primary">
                  {profile.name?.charAt(0) || "T"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg leading-tight">{profile.name}</h3>
                {profile.title && (
                  <p className="text-sm text-muted-foreground mt-0.5">{profile.title}</p>
                )}
              </div>
            </div>

            {profile.bio ? (
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {profile.bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                This professor hasn't added a bio yet.
              </p>
            )}

            {profile.linkedinUrl && (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Linkedin className="w-4 h-4" />
                View LinkedIn Profile
              </a>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Profile not available.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
