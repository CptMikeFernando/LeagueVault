import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertPayment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function usePayments(leagueId: number) {
  return useQuery({
    queryKey: [api.payments.history.path, leagueId],
    queryFn: async () => {
      const url = buildUrl(api.payments.history.path, { id: leagueId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payment history");
      return api.payments.history.responses[200].parse(await res.json());
    },
    enabled: !!leagueId,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { leagueId: number; amount: number }) => {
      const res = await fetch(api.payments.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to process payment");
      return api.payments.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.payments.history.path, variables.leagueId] });
      queryClient.invalidateQueries({ queryKey: [api.leagues.get.path, variables.leagueId] });
      toast({
        title: "Payment Successful",
        description: "Your dues have been paid securely.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
