import { useQuery } from "@tanstack/react-query";

export function useAdminCheck() {
  return useQuery({
    queryKey: ['/api/admin/check'],
    queryFn: async () => {
      const res = await fetch('/api/admin/check', { credentials: 'include' });
      if (!res.ok) return { isAdmin: false };
      return res.json() as Promise<{ isAdmin: boolean }>;
    },
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['/api/admin/stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch admin stats');
      return res.json() as Promise<{
        totalLeagues: number;
        totalUsers: number;
        totalPayments: number;
        totalPayouts: number;
        totalFundsCollected: string;
        totalFundsPaidOut: string;
      }>;
    },
  });
}

export function useAdminLeagues() {
  return useQuery({
    queryKey: ['/api/admin/leagues'],
    queryFn: async () => {
      const res = await fetch('/api/admin/leagues', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch leagues');
      return res.json();
    },
  });
}
