import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertLeague, InsertLeagueMember } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useLeagues() {
  return useQuery({
    queryKey: [api.leagues.list.path],
    queryFn: async () => {
      const res = await fetch(api.leagues.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leagues");
      return api.leagues.list.responses[200].parse(await res.json());
    },
  });
}

export function useLeague(id: number) {
  return useQuery({
    queryKey: [api.leagues.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.leagues.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch league details");
      return api.leagues.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateLeague() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertLeague) => {
      const res = await fetch(api.leagues.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create league");
      }
      return api.leagues.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({
        title: "League Created",
        description: "Your new league has been set up successfully.",
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

export function useJoinLeague() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, teamName }: { leagueId: number, teamName: string }) => {
      const url = buildUrl(api.leagues.join.path, { id: leagueId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to join league");
      return api.leagues.join.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.get.path, variables.leagueId] });
      toast({
        title: "Joined League",
        description: "You have successfully joined this league.",
      });
    },
  });
}

export function useSyncPlatform() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: { platform: 'espn' | 'yahoo', leagueUrl: string }) => {
      const res = await fetch(api.leagues.syncPlatform.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to sync platform");
      return api.leagues.syncPlatform.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({
        title: "League Imported",
        description: "Your league has been created from platform data.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
