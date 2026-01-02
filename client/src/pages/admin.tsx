import { useAdminCheck, useAdminStats, useAdminLeagues } from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  DollarSign, 
  Users, 
  Trophy, 
  ArrowUpRight, 
  ArrowDownLeft,
  ShieldCheck,
  Building2,
  TrendingUp
} from "lucide-react";
import { format } from "date-fns";

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: adminCheck, isLoading: checkingAdmin } = useAdminCheck();
  const isAdmin = adminCheck?.isAdmin === true;
  const { data: stats, isLoading: loadingStats } = useAdminStats(isAdmin);
  const { data: leagues, isLoading: loadingLeagues } = useAdminLeagues(isAdmin);

  if (checkingAdmin) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <ShieldCheck className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center">
          You don't have permission to access the admin dashboard.
        </p>
      </div>
    );
  }

  const netBalance = stats 
    ? (parseFloat(stats.totalFundsCollected) - parseFloat(stats.totalFundsPaidOut)).toFixed(2)
    : "0.00";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform-wide financial overview</p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingStats ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : stats ? (
          <>
            <StatCard
              title="Total Funds Collected"
              value={`$${parseFloat(stats.totalFundsCollected).toFixed(2)}`}
              icon={ArrowDownLeft}
              description="All completed payments"
            />
            <StatCard
              title="Total Funds Paid Out"
              value={`$${parseFloat(stats.totalFundsPaidOut).toFixed(2)}`}
              icon={ArrowUpRight}
              description="All completed payouts"
            />
            <StatCard
              title="Net Balance"
              value={`$${netBalance}`}
              icon={DollarSign}
              description="Available platform funds"
            />
            <StatCard
              title="Active Leagues"
              value={stats.totalLeagues}
              icon={Trophy}
              description={`${stats.totalUsers} registered users`}
            />
          </>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Treasury Summary
          </CardTitle>
          <CardDescription>
            Overview of platform finances across all leagues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Transactions</p>
              <p className="text-3xl font-bold">
                {loadingStats ? <Skeleton className="h-9 w-20" /> : (stats?.totalPayments || 0) + (stats?.totalPayouts || 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats?.totalPayments || 0} payments, {stats?.totalPayouts || 0} payouts
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Platform Float</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {loadingStats ? <Skeleton className="h-9 w-24" /> : `$${netBalance}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Currently held in platform
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Interest Potential</p>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Connect a banking partner to earn interest on float
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Leagues</CardTitle>
          <CardDescription>
            {loadingLeagues ? "Loading..." : `${leagues?.length || 0} leagues on platform`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLeagues ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : leagues?.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No leagues created yet
            </p>
          ) : (
            <div className="space-y-2">
              {leagues?.map((league: any) => (
                <div 
                  key={league.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  data-testid={`admin-league-${league.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{league.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Season {league.seasonYear}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">
                      ${parseFloat(league.totalDues || "0").toFixed(2)} collected
                    </Badge>
                    <Badge variant="outline">{league.platform}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
