import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { InsertPayout } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useCreatePayout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertPayout) => {
      const res = await fetch(api.payouts.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to issue payout");
      return api.payouts.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.payments.history.path, variables.leagueId] });
      toast({
        title: "Payout Issued",
        description: "Funds have been released to the member.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Payout Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
