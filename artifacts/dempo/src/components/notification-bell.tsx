import {
  useListNotifications,
  getListNotificationsQueryKey,
  useMarkNotificationsRead,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  FileText,
  GraduationCap,
  Megaphone,
  MessageSquare,
  CalendarClock,
  CheckCheck,
} from "lucide-react";
import { useState } from "react";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "assignment.created": FileText,
  "submission.graded": GraduationCap,
  "announcement.posted": Megaphone,
  "message.received": MessageSquare,
  "class.scheduled": CalendarClock,
  "class.reminder": CalendarClock,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data } = useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 30000,
    },
  });
  const markRead = useMarkNotificationsRead();

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });

  const handleClick = (n: (typeof notifications)[number]) => {
    if (!n.readAt) {
      markRead.mutate({ data: { ids: [n.id] } }, { onSuccess: refresh });
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = () => {
    markRead.mutate({ data: { all: true } }, { onSuccess: refresh });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={handleMarkAll}
              disabled={markRead.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="overflow-y-auto divide-y">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              You're all caught up.
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors ${!n.readAt ? "bg-primary/5" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${!n.readAt ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm truncate ${!n.readAt ? "font-semibold" : "font-medium"}`}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  {!n.readAt && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2"></span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
