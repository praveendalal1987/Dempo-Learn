import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCourseSimilarities,
  getListCourseSimilaritiesQueryKey,
  useSetSimilarityDismissal,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ShieldCheck,
  ArrowRight,
  EyeOff,
  Eye,
  Undo2,
} from "lucide-react";
import { format } from "date-fns";
import { SimilarityBadge } from "@/pages/assignment-view";

/**
 * Teacher-only course integrity overview: every flagged similarity pair across
 * all of the course's assignments in one place. Dismissed pairs are hidden by
 * default behind a toggle.
 */
export function CourseIntegrityView({ courseId }: { courseId: number }) {
  const [showDismissed, setShowDismissed] = useState(false);
  const queryClient = useQueryClient();
  const { data: pairs, isLoading } = useListCourseSimilarities(courseId, {
    query: { enabled: !!courseId, queryKey: getListCourseSimilaritiesQueryKey(courseId) },
  });

  const dismissMutation = useSetSimilarityDismissal({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getListCourseSimilaritiesQueryKey(courseId),
        });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const allPairs = pairs ?? [];
  const activePairs = allPairs.filter((p) => !p.dismissedAt);
  const dismissedCount = allPairs.length - activePairs.length;
  const visiblePairs = showDismissed ? allPairs : activePairs;

  if (allPairs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
          <ShieldCheck className="w-12 h-12 text-muted mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No similarity flags</h3>
          <p className="max-w-sm">
            No pairs of submissions across this course's assignments have been flagged as
            unusually similar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const setDismissed = (similarityId: number, dismissed: boolean) => {
    dismissMutation.mutate({ similarityId, data: { dismissed } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-serif font-semibold">Flagged Similar Work</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {activePairs.length} flagged pair{activePairs.length === 1 ? "" : "s"}
            {dismissedCount > 0 && ` (${dismissedCount} dismissed)`}
          </span>
          {dismissedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDismissed((v) => !v)}
              data-testid="button-toggle-dismissed"
            >
              {showDismissed ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide dismissed
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Show dismissed
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {visiblePairs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-muted-foreground flex flex-col items-center">
            <ShieldCheck className="w-10 h-10 text-muted mb-3" />
            <p className="max-w-sm">
              All flagged pairs have been reviewed and dismissed. Use "Show dismissed" to
              see them.
            </p>
          </CardContent>
        </Card>
      ) : (
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th className="px-6 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Assignment</th>
                <th className="px-6 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Students</th>
                <th className="px-6 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Similarity</th>
                <th className="px-6 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Checked</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visiblePairs.map((pair) => (
                <tr
                  key={pair.id}
                  className={`hover:bg-muted/40 transition-colors ${pair.dismissedAt ? "opacity-60" : ""}`}
                  data-testid={`row-similarity-${pair.id}`}
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/assignment/${pair.assignmentId}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {pair.assignmentTitle}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/submission/${pair.submissionA.submissionId}`}
                        className="hover:text-primary hover:underline transition-colors"
                      >
                        {pair.submissionA.studentName || "Unknown student"}
                      </Link>
                      <span className="text-muted-foreground">&harr;</span>
                      <Link
                        href={`/submission/${pair.submissionB.submissionId}`}
                        className="hover:text-primary hover:underline transition-colors"
                      >
                        {pair.submissionB.studentName || "Unknown student"}
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <SimilarityBadge score={pair.score} />
                      {pair.dismissedAt && (
                        <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5 whitespace-nowrap">
                          Dismissed {format(new Date(pair.dismissedAt), "MMM d")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                    {format(new Date(pair.computedAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      <Link
                        href={`/submission/${pair.submissionA.submissionId}`}
                        className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline"
                      >
                        Review <ArrowRight className="w-3 h-3" />
                      </Link>
                      {pair.dismissedAt ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={dismissMutation.isPending}
                          onClick={() => setDismissed(pair.id, false)}
                          data-testid={`button-restore-${pair.id}`}
                        >
                          <Undo2 className="w-3 h-3 mr-1" /> Restore
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          disabled={dismissMutation.isPending}
                          onClick={() => setDismissed(pair.id, true)}
                          data-testid={`button-dismiss-${pair.id}`}
                        >
                          <EyeOff className="w-3 h-3 mr-1" /> Dismiss
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
