import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { WeeklyScore } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

export function useUpdateScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { leagueId: number, userId: string, week: number, score: number }) => {
      // Backend expects string/number handling via zod coerce usually, 
      // but here we align with insertWeeklyScoreSchema
      const payload = {
        leagueId: data.leagueId,
        userId: data.userId,
        week: data.week,
        score: data.score,
      };
      
      const url = buildUrl(api.scores.update.path, { id: data.leagueId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update score");
      return api.scores.update.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      toast({
        title: "Score Updated",
        description: "Weekly score recorded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
