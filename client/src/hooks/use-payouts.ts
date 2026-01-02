import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

type CreatePayoutData = {
  leagueId: number;
  userId: string;
  amount: number;
  reason: string;
  week?: number | null;
  payoutType?: 'standard' | 'instant';
};

export function useCreatePayout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePayoutData) => {
      const res = await fetch(api.payouts.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to issue payout");
      return res.json();
    },
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.payments.history.path, variables.leagueId] });
      const isInstant = variables.payoutType === 'instant';
      toast({
        title: isInstant ? "Instant Payout Issued" : "Payout Issued",
        description: isInstant 
          ? `Funds sent instantly. Fee: $${response.feeCharged || '0'}`
          : "Funds will arrive in 3-5 business days.",
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
