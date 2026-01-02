import { useLeagues, useJoinLeague, useSyncPlatform } from "@/hooks/use-leagues";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ArrowRight, DollarSign, Plus, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: leagues, isLoading } = useLeagues();
  
  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const hasLeagues = leagues && leagues.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Leagues</h1>
          <p className="text-muted-foreground">Manage your fantasy finances and payouts.</p>
        </div>
        <div className="flex gap-3">
          <JoinLeagueDialog />
          <ImportLeagueDialog />
          <Link href="/create-league">
            <Button className="shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" />
              Create League
            </Button>
          </Link>
        </div>
      </div>

      {!hasLeagues ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leagues.map((league) => (
            <Link key={league.id} href={`/league/${league.id}`} className="group">
              <Card className="h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-primary/5">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <Badge variant="secondary" className="mb-2 font-medium">
                      {league.seasonYear} Season
                    </Badge>
                    {league.platform !== 'custom' && (
                      <Badge variant="outline" className="uppercase text-[10px] tracking-wider">
                        {league.platform}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">
                    {league.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <DollarSign className="w-4 h-4" /> Total Pot
                      </span>
                      <span className="font-mono font-bold">${Number(league.totalDues).toLocaleString()}</span>
                    </div>
                    {league.settings?.weeklyPayoutAmount && league.settings.weeklyPayoutAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Trophy className="w-4 h-4" /> Weekly Prize
                        </span>
                        <span className="font-mono">${league.settings?.weeklyPayoutAmount}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-3 border-t bg-muted/20">
                  <div className="w-full flex items-center justify-between text-sm font-medium text-primary">
                    <span>View Dashboard</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-3xl bg-muted/10 text-center">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <Trophy className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-bold mb-2">No leagues yet</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Create a new league to start collecting dues, or import one from your favorite fantasy platform.
      </p>
      <Link href="/create-league">
        <Button size="lg">Create Your First League</Button>
      </Link>
    </div>
  );
}

function JoinLeagueDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [leagueId, setLeagueId] = useState("");
  const [teamName, setTeamName] = useState("");
  const joinLeague = useJoinLeague();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    joinLeague.mutate(
      { leagueId: parseInt(leagueId), teamName },
      { onSuccess: () => setIsOpen(false) }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Join League</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join Existing League</DialogTitle>
          <DialogDescription>
            Enter the League ID provided by your commissioner to join.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>League ID</Label>
            <Input 
              placeholder="e.g. 1024" 
              value={leagueId} 
              onChange={(e) => setLeagueId(e.target.value)} 
              required
              type="number"
            />
          </div>
          <div className="space-y-2">
            <Label>Your Team Name</Label>
            <Input 
              placeholder="The Waivers Warriors" 
              value={teamName} 
              onChange={(e) => setTeamName(e.target.value)}
              required 
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={joinLeague.isPending}>
              {joinLeague.isPending ? "Joining..." : "Join League"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportLeagueDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const sync = useSyncPlatform();
  const [platform, setPlatform] = useState<'espn' | 'yahoo'>('espn');
  const [url, setUrl] = useState("");

  const handleSync = (e: React.FormEvent) => {
    e.preventDefault();
    sync.mutate(
      { platform, leagueUrl: url },
      { onSuccess: () => setIsOpen(false) }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Import League</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from Platform</DialogTitle>
          <DialogDescription>
            Connect your ESPN or Yahoo league to auto-populate settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSync} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="espn">ESPN Fantasy</SelectItem>
                <SelectItem value="yahoo">Yahoo Fantasy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>League URL</Label>
            <Input 
              placeholder="https://fantasy.espn.com/football/league?leagueId=..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="bg-muted p-4 rounded-lg flex gap-3 text-sm text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>This will create a new league in LeagueVault using your public league settings.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={sync.isPending}>
              {sync.isPending ? "Syncing..." : "Import League"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
