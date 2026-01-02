import { useLeague } from "@/hooks/use-leagues";
import { usePayments, useCreatePayment } from "@/hooks/use-payments";
import { useCreatePayout } from "@/hooks/use-payouts";
import { useUpdateScore } from "@/hooks/use-scores";
import { useAuth } from "@/hooks/use-auth";
import { useParams, Link } from "wouter";
import { 
  Tabs, TabsContent, TabsList, TabsTrigger 
} from "@/components/ui/tabs";
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Users, 
  Wallet, 
  Trophy, 
  Settings,
  CreditCard,
  Plus,
  AlertCircle,
  Building,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Save,
  Phone,
  MessageSquare,
  Link2,
  Calculator
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const leagueId = id ? parseInt(id) : 0;
  const { data: league, isLoading, error } = useLeague(leagueId);
  const { user } = useAuth();

  if (!id || leagueId <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Invalid League</h2>
        <p className="text-muted-foreground">No league ID provided.</p>
        <Link href="/dashboard">
          <Button className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">League Not Found</h2>
        <p className="text-muted-foreground">This league doesn't exist or you don't have access to it.</p>
        <Link href="/dashboard">
          <Button className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const isCommissioner = user?.id === league.commissionerId;
  const currentMember = league.members.find(m => m.userId === user?.id);
  const isMember = !!currentMember;

  // Calculate stats
  const totalPaid = league.payments?.reduce((acc: number, p: any) => acc + Number(p.amount), 0) || 0;
  const totalPayouts = league.payouts?.reduce((acc: number, p: any) => acc + Number(p.amount), 0) || 0;
  const currentPot = totalPaid - totalPayouts;
  const paidMembersCount = league.members.filter(m => m.paidStatus === 'paid').length;
  const paymentProgress = (paidMembersCount / league.members.length) * 100;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold font-display tracking-tight">{league.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">{league.seasonYear}</Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            Commissioner: <span className="font-medium text-foreground">{league.commissionerId === user?.id ? "You" : "Commissioner"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {!isMember && (
            <Link href="/dashboard">
              <Button variant="default">Join League</Button>
            </Link>
          )}
          {isCommissioner && (
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" /> Settings
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Current Pot"
          value={`$${currentPot.toLocaleString()}`}
          icon={Wallet}
          className="bg-primary/5 border-primary/20"
          description={`${paidMembersCount}/${league.members.length} members paid`}
        />
        <StatCard
          title="Total Collected"
          value={`$${totalPaid.toLocaleString()}`}
          icon={ArrowDownLeft}
          trend="up"
          trendValue="100%"
        />
        <StatCard
          title="Total Paid Out"
          value={`$${totalPayouts.toLocaleString()}`}
          icon={ArrowUpRight}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
          <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">Overview</TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">Members</TabsTrigger>
          <TabsTrigger value="finances" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">Finances</TabsTrigger>
          {isCommissioner && (
            <>
              <TabsTrigger value="treasury" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium" data-testid="tab-treasury">Treasury</TabsTrigger>
              <TabsTrigger value="tools" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">Commish Tools</TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium" data-testid="tab-settings">Settings</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>My Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {currentMember ? (
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${currentMember.paidStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {currentMember.paidStatus === 'paid' ? <Trophy className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-medium">Team: {currentMember.teamName}</p>
                          <p className="text-sm text-muted-foreground">
                            {currentMember.paidStatus === 'paid' ? "You're all paid up!" : `Dues owed: $${league.settings?.entryFee || league.settings?.seasonDues || 0}`}
                          </p>
                        </div>
                      </div>
                      {currentMember.paidStatus !== 'paid' && (
                         <PayDuesDialog league={league} userId={user!.id} amount={league.settings?.entryFee || league.settings?.seasonDues || 0} />
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">You are not a member of this league.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>League Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {league.payments && league.payments.slice(0, 5).map((payment: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{payment.userId.substring(0,2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">Payment Received</p>
                            <p className="text-muted-foreground text-xs">{format(new Date(payment.createdAt), 'MMM d, yyyy')}</p>
                          </div>
                        </div>
                        <span className="font-mono font-medium text-green-600">
                          +${Number(payment.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>League Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm pb-2 border-b">
                    <span className="text-muted-foreground">Members</span>
                    <span className="font-mono font-medium" data-testid="text-member-count">{league.members?.length || 0} teams</span>
                  </div>
                  <div className="flex justify-between text-sm pb-2 border-b">
                    <span className="text-muted-foreground">Entry Fee</span>
                    <span className="font-mono font-medium">${league.settings?.entryFee || league.settings?.seasonDues || 0}</span>
                  </div>
                  <div className="bg-muted p-3 rounded-md text-sm space-y-2">
                    <p className="font-medium text-foreground">Season Payouts:</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">1st Place</span>
                      <span className="font-mono font-medium text-foreground">${league.settings?.firstPlacePayout || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">2nd Place</span>
                      <span className="font-mono font-medium text-foreground">${league.settings?.secondPlacePayout || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">3rd Place</span>
                      <span className="font-mono font-medium text-foreground">${league.settings?.thirdPlacePayout || 0}</span>
                    </div>
                  </div>
                  <div className="bg-muted p-3 rounded-md text-sm space-y-2">
                    <p className="font-medium text-foreground">Weekly:</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">HPS Prize</span>
                      <span className="font-mono font-medium text-green-600">+${league.settings?.weeklyHighScorePrize || league.settings?.weeklyPayoutAmount || 0}</span>
                    </div>
                    {league.settings?.weeklyLowScoreFeeEnabled && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">LPS Fee</span>
                        <span className="font-mono font-medium text-red-600">-${league.settings?.weeklyLowScoreFee || 0}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <PayoutCalculatorCard league={league} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>League Members</CardTitle>
              <CardDescription>{league.members.length} teams competing</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {league.members.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                             <AvatarFallback>{member.userId.substring(0,2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          User {member.userId.slice(0,4)}...
                        </div>
                      </TableCell>
                      <TableCell>{member.teamName}</TableCell>
                      <TableCell className="capitalize">{member.role}</TableCell>
                      <TableCell>
                        <Badge variant={member.paidStatus === 'paid' ? 'default' : 'destructive'} className="capitalize">
                          {member.paidStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finances">
          <FinancesTab league={league} />
        </TabsContent>

        {isCommissioner && (
          <TabsContent value="treasury">
            <TreasuryTab leagueId={leagueId} />
          </TabsContent>
        )}

        {isCommissioner && (
          <TabsContent value="tools">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                       <Wallet className="w-5 h-5 text-primary" /> Issue Payout
                    </CardTitle>
                    <CardDescription>Send funds to a league member.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <IssuePayoutForm league={league} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                       <Trophy className="w-5 h-5 text-yellow-500" /> Record Weekly Score
                    </CardTitle>
                    <CardDescription>Log high scores for automation.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WeeklyScoreForm league={league} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                       <RefreshCw className="w-5 h-5 text-blue-500" /> Sync Scores
                    </CardTitle>
                    <CardDescription>Pull scores from {league.platform === 'custom' ? 'manual input' : league.platform.toUpperCase()}.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SyncScoresForm league={league} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                       <Phone className="w-5 h-5 text-green-500" /> Payment Reminders
                    </CardTitle>
                    <CardDescription>Send SMS reminders to unpaid members.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SendRemindersForm league={league} />
                  </CardContent>
                </Card>
             </div>
          </TabsContent>
        )}

        {isCommissioner && (
          <TabsContent value="settings">
            <div className="space-y-6">
              <LeagueSettingsForm league={league} />
              <EspnSettingsForm league={league} />
              <EspnTeamMappingForm league={league} />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function PayoutCalculatorCard({ league }: { league: any }) {
  const settings = league.settings || {};
  const memberCount = league.members?.length || 0;
  const numberOfWeeks = settings.numberOfWeeks || 17;
  
  const entryFee = Number(settings.entryFee || settings.seasonDues || 0);
  const firstPlace = Number(settings.firstPlacePayout || 0);
  const secondPlace = Number(settings.secondPlacePayout || 0);
  const thirdPlace = Number(settings.thirdPlacePayout || 0);
  const weeklyHps = Number(settings.weeklyHighScorePrize || settings.weeklyPayoutAmount || 0);
  const weeklyLps = Number(settings.weeklyLowScoreFee || 0);
  const lpsEnabled = settings.weeklyLowScoreFeeEnabled || false;
  
  const totalRevenue = memberCount * entryFee;
  const totalWeeklyLpsRevenue = lpsEnabled ? weeklyLps * numberOfWeeks : 0;
  const totalIncome = totalRevenue + totalWeeklyLpsRevenue;
  
  const seasonPayouts = firstPlace + secondPlace + thirdPlace;
  const totalWeeklyHpsPayouts = weeklyHps * numberOfWeeks;
  const totalPayouts = seasonPayouts + totalWeeklyHpsPayouts;
  
  const balance = totalIncome - totalPayouts;
  const isBalanced = balance >= 0;
  
  return (
    <Card data-testid="card-payout-calculator">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Budget Forecast
        </CardTitle>
        <CardDescription>Projected season income vs payouts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <p className="font-medium text-foreground">Entry Fee Revenue</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{memberCount} members x ${entryFee}</span>
            <span className="font-mono text-green-600">+${totalRevenue.toFixed(2)}</span>
          </div>
        </div>
        
        {lpsEnabled && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-foreground">Est. LPS Revenue</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{numberOfWeeks} weeks x ${weeklyLps}</span>
              <span className="font-mono text-green-600">+${totalWeeklyLpsRevenue.toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Collected weekly from lowest scorers</p>
          </div>
        )}
        
        <div className="space-y-2 text-sm border-t pt-3">
          <p className="font-medium text-foreground">Planned Payouts</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Season (1st + 2nd + 3rd)</span>
            <span className="font-mono text-red-600">-${seasonPayouts.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{numberOfWeeks} weeks x ${weeklyHps} HPS</span>
            <span className="font-mono text-red-600">-${totalWeeklyHpsPayouts.toFixed(2)}</span>
          </div>
        </div>
        
        <div className={`p-3 rounded-md ${isBalanced ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <div className="flex justify-between items-center">
            <span className={`font-medium ${isBalanced ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {isBalanced ? 'Payouts Covered' : 'Shortfall'}
            </span>
            <span className={`font-mono font-bold ${isBalanced ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`} data-testid="text-payout-balance">
              {isBalanced ? `+$${balance.toFixed(2)}` : `-$${Math.abs(balance).toFixed(2)}`}
            </span>
          </div>
          {!isBalanced && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Increase entry fees or reduce payouts to cover the shortfall.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PayDuesDialog({ league, userId, amount }: { league: any, userId: string, amount: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const createPayment = useCreatePayment();

  const handlePay = () => {
    createPayment.mutate({
      leagueId: league.id,
      userId,
      amount: amount,
    }, {
      onSuccess: () => setIsOpen(false)
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Pay Dues</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Secure Checkout</DialogTitle>
          <DialogDescription>Pay your season dues securely via Stripe.</DialogDescription>
        </DialogHeader>
        <div className="py-6 space-y-4">
          <div className="flex justify-between items-center text-lg font-medium">
             <span>Season Dues</span>
             <span>${amount}</span>
          </div>
          <div className="bg-muted p-4 rounded border flex items-center gap-3">
            <CreditCard className="w-6 h-6" />
            <div className="text-sm">
               <p className="font-medium">Mock Payment Method</p>
               <p className="text-muted-foreground">•••• •••• •••• 4242</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handlePay} disabled={createPayment.isPending} className="w-full">
            {createPayment.isPending ? "Processing..." : `Pay $${amount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssuePayoutForm({ league }: { league: any }) {
  const createPayout = useCreatePayout();
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("other");
  const [payoutType, setPayoutType] = useState<'standard' | 'instant'>('standard');

  const INSTANT_FEE_PERCENT = 2.5;
  const feeAmount = payoutType === 'instant' && amount ? (Number(amount) * INSTANT_FEE_PERCENT / 100).toFixed(2) : "0.00";
  const netAmount = payoutType === 'instant' && amount ? (Number(amount) - Number(feeAmount)).toFixed(2) : amount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPayout.mutate({
      leagueId: league.id,
      userId: recipientId,
      amount: Number(amount),
      reason,
      payoutType
    }, {
      onSuccess: () => {
        setAmount("");
        setRecipientId("");
        setPayoutType('standard');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
       <div className="space-y-2">
         <Label>Recipient</Label>
         <Select onValueChange={setRecipientId} value={recipientId}>
           <SelectTrigger data-testid="select-payout-recipient">
             <SelectValue placeholder="Select member" />
           </SelectTrigger>
           <SelectContent>
             {league.members.map((m: any) => (
               <SelectItem key={m.userId} value={m.userId}>{m.teamName}</SelectItem>
             ))}
           </SelectContent>
         </Select>
       </div>
       <div className="space-y-2">
         <Label>Amount</Label>
         <div className="relative">
           <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
           <Input 
              type="number" 
              className="pl-8" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              required
              data-testid="input-payout-amount"
            />
         </div>
       </div>
       <div className="space-y-2">
         <Label>Reason</Label>
         <Select onValueChange={setReason} value={reason}>
            <SelectTrigger data-testid="select-payout-reason"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1st_place">1st Place</SelectItem>
              <SelectItem value="2nd_place">2nd Place</SelectItem>
              <SelectItem value="3rd_place">3rd Place</SelectItem>
              <SelectItem value="weekly_high_score">Weekly High Score</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
         </Select>
       </div>
       <div className="space-y-3">
         <Label>Payout Speed</Label>
         <div className="grid grid-cols-2 gap-3">
           <div 
             className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${payoutType === 'standard' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'}`}
             onClick={() => setPayoutType('standard')}
             data-testid="option-standard-payout"
           >
             <div className="flex items-center justify-between mb-2">
               <span className="font-medium">Standard</span>
               <Badge variant="secondary">Free</Badge>
             </div>
             <p className="text-sm text-muted-foreground">3-5 business days</p>
           </div>
           <div 
             className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${payoutType === 'instant' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'}`}
             onClick={() => setPayoutType('instant')}
             data-testid="option-instant-payout"
           >
             <div className="flex items-center justify-between mb-2">
               <span className="font-medium">Instant</span>
               <Badge variant="outline">{INSTANT_FEE_PERCENT}% fee</Badge>
             </div>
             <p className="text-sm text-muted-foreground">Within minutes</p>
           </div>
         </div>
       </div>
       {payoutType === 'instant' && amount && Number(amount) > 0 && (
         <div className="bg-muted/50 p-3 rounded-lg space-y-2 text-sm">
           <div className="flex justify-between">
             <span className="text-muted-foreground">Payout Amount</span>
             <span>${amount}</span>
           </div>
           <div className="flex justify-between text-destructive">
             <span>Instant Fee ({INSTANT_FEE_PERCENT}%)</span>
             <span>-${feeAmount}</span>
           </div>
           <Separator />
           <div className="flex justify-between font-medium">
             <span>Recipient Receives</span>
             <span>${netAmount}</span>
           </div>
         </div>
       )}
       <Button type="submit" className="w-full" disabled={createPayout.isPending} data-testid="button-issue-payout">
         {createPayout.isPending ? "Issuing..." : payoutType === 'instant' ? `Issue Instant Payout ($${feeAmount} fee)` : "Issue Payout"}
       </Button>
    </form>
  );
}

function WeeklyScoreForm({ league }: { league: any }) {
  const updateScore = useUpdateScore();
  const [userId, setUserId] = useState("");
  const [week, setWeek] = useState("1");
  const [score, setScore] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateScore.mutate({
      leagueId: league.id,
      userId,
      week: parseInt(week),
      score: Number(score)
    }, {
      onSuccess: () => setScore("")
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Week</Label>
          <Input type="number" value={week} onChange={e => setWeek(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Score</Label>
          <Input type="number" step="0.01" value={score} onChange={e => setScore(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Team</Label>
        <Select onValueChange={setUserId} value={userId}>
           <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
           <SelectContent>
             {league.members.map((m: any) => (
               <SelectItem key={m.userId} value={m.userId}>{m.teamName}</SelectItem>
             ))}
           </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={updateScore.isPending}>
         {updateScore.isPending ? "Saving..." : "Record Score"}
      </Button>
    </form>
  );
}

function FinancesTab({ league }: { league: any }) {
  const { data: history, isLoading } = usePayments(league.id);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const payments = history?.payments || [];
  const payouts = history?.payouts || [];

  // Helper to get team name from userId
  const getTeamName = (userId: string) => {
    const member = league.members?.find((m: any) => m.userId === userId);
    return member?.teamName || 'Unknown Team';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-green-700">Money In</CardTitle>
          <CardDescription>Dues collected from members</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
             {payments.length === 0 ? (
               <p className="text-sm text-muted-foreground text-center py-8">No payments received yet.</p>
             ) : (
               <div className="space-y-4">
                 {payments.map((p: any) => (
                   <div key={p.id} className="flex justify-between items-center border-b pb-2 last:border-0" data-testid={`payment-row-${p.id}`}>
                      <div>
                        <p className="font-medium text-sm">{getTeamName(p.userId)}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.createdAt), 'MMM d, yyyy')}</p>
                      </div>
                      <span className="font-mono font-medium text-green-600">+${Number(p.amount).toFixed(2)}</span>
                   </div>
                 ))}
               </div>
             )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-red-700">Money Out</CardTitle>
          <CardDescription>Prizes and payouts distributed</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
             {payouts.length === 0 ? (
               <p className="text-sm text-muted-foreground text-center py-8">No payouts issued yet.</p>
             ) : (
               <div className="space-y-4">
                 {payouts.map((p: any) => (
                   <div key={p.id} className="flex justify-between items-center border-b pb-2 last:border-0" data-testid={`payout-row-${p.id}`}>
                      <div>
                        <p className="font-medium text-sm">{getTeamName(p.userId)}</p>
                        <p className="text-xs text-muted-foreground capitalize">{p.reason.replace(/_/g, " ")} - {format(new Date(p.createdAt), 'MMM d, yyyy')}</p>
                      </div>
                      <span className="font-mono font-medium text-red-600">-${Number(p.amount).toFixed(2)}</span>
                   </div>
                 ))}
               </div>
             )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

interface TreasuryData {
  totalInflow: string;
  totalOutflow: string;
  availableBalance: string;
  memberWallets: Array<{
    id: number;
    userId: string;
    availableBalance: string;
    totalEarnings: string;
    totalWithdrawn: string;
  }>;
  leagueName: string;
}

function TreasuryTab({ leagueId }: { leagueId: number }) {
  const { data: treasury, isLoading } = useQuery<TreasuryData>({
    queryKey: ['/api/leagues', leagueId, 'treasury'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/treasury`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch treasury');
      return res.json();
    }
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (!treasury) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Unable to load treasury data</p>
        </CardContent>
      </Card>
    );
  }

  const totalInflow = Number(treasury.totalInflow || 0);
  const totalOutflow = Number(treasury.totalOutflow || 0);
  const availableBalance = Number(treasury.availableBalance || 0);
  const memberWallets = treasury.memberWallets || [];
  const totalWalletBalances = memberWallets.reduce((sum, w) => sum + Number(w.availableBalance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-treasury-balance">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">League Treasury</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-treasury-balance">${availableBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Available for payouts</p>
          </CardContent>
        </Card>

        <Card data-testid="card-treasury-inflow">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-treasury-inflow">${totalInflow.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Dues received</p>
          </CardContent>
        </Card>

        <Card data-testid="card-treasury-outflow">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid Out</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-treasury-outflow">${totalOutflow.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Payouts issued</p>
          </CardContent>
        </Card>

        <Card data-testid="card-member-balances">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Member Wallets</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-member-balances">${totalWalletBalances.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Held in member wallets</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Wallet Balances</CardTitle>
          <CardDescription>Overview of all member wallets in this league</CardDescription>
        </CardHeader>
        <CardContent>
          {memberWallets.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No member wallets yet. Issue payouts to create wallets.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Total Earned</TableHead>
                  <TableHead className="text-right">Total Withdrawn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberWallets.map((wallet) => (
                  <TableRow key={wallet.id} data-testid={`row-wallet-${wallet.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{wallet.userId.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        User {wallet.userId.slice(0, 4)}...
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">${Number(wallet.availableBalance).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">${Number(wallet.totalEarnings).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">${Number(wallet.totalWithdrawn).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SyncScoresForm({ league }: { league: any }) {
  const [week, setWeek] = useState("1");
  const [lastResult, setLastResult] = useState<any>(null);
  const { toast } = useToast();
  
  const syncScores = useMutation({
    mutationFn: async (data: { week: number }) => {
      const response = await apiRequest('POST', `/api/leagues/${league.id}/sync-scores`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', league.id] });
      setLastResult(data);
      
      let description = `${data.scoresUpdated} scores updated from ${data.source}`;
      if (data.automation?.hpsPayoutCreated) {
        description += ` | HPS payout: $${data.automation.hpsAmount}`;
      }
      if (data.automation?.lpsRequestCreated) {
        description += ` | LPS fee requested: $${data.automation.lpsAmount}`;
      }
      
      // Show warning if ESPN failed
      if (data.espnError) {
        toast({
          title: "ESPN Sync Failed",
          description: `${data.espnError}. Using mock scores instead.`,
          variant: "destructive",
        });
      } else if (data.unmappedMembers?.length > 0) {
        toast({
          title: "Some Members Unmapped",
          description: `${data.unmappedMembers.length} member(s) don't have ESPN teams linked. Check team mapping in Settings.`,
        });
      }
      
      toast({
        title: "Scores Synced",
        description,
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Could not sync scores. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSync = (e: React.FormEvent) => {
    e.preventDefault();
    syncScores.mutate({ week: Number(week) });
  };

  return (
    <form onSubmit={handleSync} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sync-week">Week Number</Label>
        <Input 
          id="sync-week" 
          type="number" 
          min="1" 
          max="18"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          data-testid="input-sync-week"
        />
      </div>
      {league.settings?.lastScoreSync && (
        <p className="text-xs text-muted-foreground">
          Last synced: {format(new Date(league.settings.lastScoreSync), 'MMM d, yyyy h:mm a')}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={syncScores.isPending} data-testid="button-sync-scores">
        {syncScores.isPending ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Week {week} Scores
          </>
        )}
      </Button>
      
      {lastResult?.automation && (
        <div className="text-xs space-y-1 p-3 bg-muted rounded-lg" data-testid="sync-automation-results">
          <p className="font-medium">Automation Results:</p>
          {lastResult.automation.hpsPayoutCreated ? (
            <p className="text-green-600">HPS: ${lastResult.automation.hpsAmount} credited to highest scorer</p>
          ) : (
            <p className="text-muted-foreground">HPS: No payout (prize not configured)</p>
          )}
          {lastResult.automation.lpsRequestCreated ? (
            <div>
              <p className="text-yellow-600">LPS: ${lastResult.automation.lpsAmount} fee requested from lowest scorer</p>
              {lastResult.automation.lpsSmsStatus === 'sent' && (
                <p className="text-green-600">SMS notification sent</p>
              )}
              {lastResult.automation.lpsSmsStatus === 'failed' && (
                <p className="text-red-600">SMS failed to send</p>
              )}
              {lastResult.automation.lpsSmsStatus === 'no_phone' && (
                <p className="text-muted-foreground">No phone number on file</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">LPS: No fee (not enabled)</p>
          )}
        </div>
      )}
    </form>
  );
}

function LeagueSettingsForm({ league }: { league: any }) {
  const { toast } = useToast();
  const settings = league.settings || {};
  
  const [entryFee, setEntryFee] = useState(String(settings.entryFee || settings.seasonDues || 0));
  const [numberOfWeeks, setNumberOfWeeks] = useState(String(settings.numberOfWeeks || 17));
  const [firstPlacePayout, setFirstPlacePayout] = useState(String(settings.firstPlacePayout || 0));
  const [secondPlacePayout, setSecondPlacePayout] = useState(String(settings.secondPlacePayout || 0));
  const [thirdPlacePayout, setThirdPlacePayout] = useState(String(settings.thirdPlacePayout || 0));
  const [weeklyHighScorePrize, setWeeklyHighScorePrize] = useState(String(settings.weeklyHighScorePrize || settings.weeklyPayoutAmount || 0));
  const [weeklyLowScoreFee, setWeeklyLowScoreFee] = useState(String(settings.weeklyLowScoreFee || settings.lowestScorerFee || 0));
  const [weeklyLowScoreFeeEnabled, setWeeklyLowScoreFeeEnabled] = useState(settings.weeklyLowScoreFeeEnabled || settings.lowestScorerFeeEnabled || false);

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', `/api/leagues/${league.id}/settings`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', league.id] });
      toast({
        title: "Settings Updated",
        description: "League payout settings have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Could not save settings. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({
      entryFee: Number(entryFee),
      numberOfWeeks: Number(numberOfWeeks),
      firstPlacePayout: Number(firstPlacePayout),
      secondPlacePayout: Number(secondPlacePayout),
      thirdPlacePayout: Number(thirdPlacePayout),
      weeklyHighScorePrize: Number(weeklyHighScorePrize),
      weeklyLowScoreFee: Number(weeklyLowScoreFee),
      weeklyLowScoreFeeEnabled,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Payout Settings
          </CardTitle>
          <CardDescription>Configure entry fees and weekly payouts for your league.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entryFee">Entry Fee (Per Person)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input 
                    id="entryFee" 
                    type="number" 
                    min="0"
                    className="pl-8 font-mono"
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value)}
                    data-testid="input-settings-entry-fee"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Amount each member pays to join.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="numberOfWeeks">Number of Weeks</Label>
                <Input 
                  id="numberOfWeeks" 
                  type="number" 
                  min="1"
                  max="21"
                  step="1"
                  className="font-mono"
                  value={numberOfWeeks}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 17;
                    setNumberOfWeeks(String(Math.max(1, Math.min(21, val))));
                  }}
                  data-testid="input-settings-number-of-weeks"
                />
                <p className="text-xs text-muted-foreground">Regular season weeks (1-21). Default: 17.</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">Season Payouts</Label>
              <p className="text-xs text-muted-foreground">Set the total payout amounts for end-of-season winners.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstPlacePayout">1st Place</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input 
                      id="firstPlacePayout" 
                      type="number" 
                      min="0"
                      className="pl-8 font-mono"
                      value={firstPlacePayout}
                      onChange={(e) => setFirstPlacePayout(e.target.value)}
                      data-testid="input-settings-first-place"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondPlacePayout">2nd Place</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input 
                      id="secondPlacePayout" 
                      type="number" 
                      min="0"
                      className="pl-8 font-mono"
                      value={secondPlacePayout}
                      onChange={(e) => setSecondPlacePayout(e.target.value)}
                      data-testid="input-settings-second-place"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thirdPlacePayout">3rd Place</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input 
                      id="thirdPlacePayout" 
                      type="number" 
                      min="0"
                      className="pl-8 font-mono"
                      value={thirdPlacePayout}
                      onChange={(e) => setThirdPlacePayout(e.target.value)}
                      data-testid="input-settings-third-place"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">Weekly Payouts</Label>
              <p className="text-xs text-muted-foreground">Configure weekly high scorer prize and low scorer penalty.</p>
              
              <div className="space-y-2">
                <Label htmlFor="weeklyHighScorePrize">Weekly High Score Prize (HPS)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input 
                    id="weeklyHighScorePrize" 
                    type="number" 
                    min="0"
                    className="pl-8 font-mono"
                    value={weeklyHighScorePrize}
                    onChange={(e) => setWeeklyHighScorePrize(e.target.value)}
                    data-testid="input-settings-weekly-high-prize"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Prize for highest scorer each week (auto-credited to wallet).</p>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="weeklyLowScoreFeeEnabled">Lowest Scorer Fee (LPS)</Label>
                  <p className="text-xs text-muted-foreground">Charge the lowest scorer each week a penalty fee.</p>
                </div>
                <Switch 
                  id="weeklyLowScoreFeeEnabled"
                  checked={weeklyLowScoreFeeEnabled}
                  onCheckedChange={setWeeklyLowScoreFeeEnabled}
                  data-testid="switch-settings-lps-enabled"
                />
              </div>

              {weeklyLowScoreFeeEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="weeklyLowScoreFee">Weekly LPS Penalty Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input 
                      id="weeklyLowScoreFee" 
                      type="number" 
                      min="0"
                      className="pl-8 font-mono"
                      value={weeklyLowScoreFee}
                      onChange={(e) => setWeeklyLowScoreFee(e.target.value)}
                      data-testid="input-settings-weekly-lps-fee"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Amount the lowest scorer must pay each week (SMS notification sent).</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={updateSettings.isPending} data-testid="button-save-settings">
                {updateSettings.isPending ? (
                  "Saving..."
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EspnSettingsForm({ league }: { league: any }) {
  const { toast } = useToast();
  const settings = league.settings || {};
  
  const [espnLeagueId, setEspnLeagueId] = useState(settings.espnLeagueId || "");
  const [espnSeasonId, setEspnSeasonId] = useState(settings.espnSeasonId || new Date().getFullYear().toString());
  const [espnPrivateLeague, setEspnPrivateLeague] = useState(settings.espnPrivateLeague || false);
  const [espnS2, setEspnS2] = useState(settings.espnS2 || "");
  const [espnSwid, setEspnSwid] = useState(settings.espnSwid || "");

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', `/api/leagues/${league.id}/settings`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', league.id] });
      toast({
        title: "ESPN Settings Saved",
        description: "Your ESPN integration settings have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Could not save ESPN settings. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({
      espnLeagueId,
      espnSeasonId,
      espnPrivateLeague,
      espnS2: espnPrivateLeague ? espnS2 : undefined,
      espnSwid: espnPrivateLeague ? espnSwid : undefined,
    });
  };

  if (league.platform !== 'espn') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            ESPN Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ESPN integration is only available for leagues with ESPN as their platform.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          ESPN Integration
        </CardTitle>
        <CardDescription>Connect your ESPN Fantasy Football league to sync real scores.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="espnLeagueId">ESPN League ID</Label>
              <Input 
                id="espnLeagueId" 
                placeholder="e.g. 12345678"
                value={espnLeagueId}
                onChange={(e) => setEspnLeagueId(e.target.value)}
                data-testid="input-espn-league-id"
              />
              <p className="text-xs text-muted-foreground">Find this in your ESPN league URL</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="espnSeasonId">Season Year</Label>
              <Input 
                id="espnSeasonId" 
                placeholder="e.g. 2025"
                value={espnSeasonId}
                onChange={(e) => setEspnSeasonId(e.target.value)}
                data-testid="input-espn-season-id"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="espnPrivateLeague">Private League</Label>
                <p className="text-xs text-muted-foreground">Enable if your ESPN league is private</p>
              </div>
              <Switch 
                id="espnPrivateLeague"
                checked={espnPrivateLeague}
                onCheckedChange={setEspnPrivateLeague}
                data-testid="switch-espn-private"
              />
            </div>

            {espnPrivateLeague && (
              <div className="space-y-4 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  For private leagues, you need to provide your ESPN cookies. 
                  Find these in your browser developer tools after logging into ESPN.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="espnS2">espn_s2 Cookie</Label>
                  <Input 
                    id="espnS2" 
                    type="password"
                    placeholder="Your espn_s2 cookie value"
                    value={espnS2}
                    onChange={(e) => setEspnS2(e.target.value)}
                    data-testid="input-espn-s2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="espnSwid">SWID Cookie</Label>
                  <Input 
                    id="espnSwid" 
                    type="password"
                    placeholder="Your SWID cookie value"
                    value={espnSwid}
                    onChange={(e) => setEspnSwid(e.target.value)}
                    data-testid="input-espn-swid"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateSettings.isPending} data-testid="button-save-espn">
              {updateSettings.isPending ? "Saving..." : "Save ESPN Settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EspnTeamMappingForm({ league }: { league: any }) {
  const { toast } = useToast();
  const settings = league.settings || {};
  
  const { data: espnTeams, isLoading, error, refetch } = useQuery<{ teams: any[] }>({
    queryKey: ['/api/leagues', league.id, 'espn-teams'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/espn-teams`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to fetch ESPN teams');
      }
      return res.json();
    },
    enabled: league.platform === 'espn' && !!settings.espnLeagueId,
    retry: false,
  });

  const updateMapping = useMutation({
    mutationFn: async ({ memberId, espnTeamId }: { memberId: number; espnTeamId: string }) => {
      const response = await apiRequest('PATCH', `/api/leagues/${league.id}/members/${memberId}/espn-team`, { espnTeamId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', league.id] });
      toast({
        title: "Team Mapped",
        description: "ESPN team mapping updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Mapping Failed",
        description: "Could not update team mapping.",
        variant: "destructive",
      });
    }
  });

  if (league.platform !== 'espn' || !settings.espnLeagueId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          ESPN Team Mapping
        </CardTitle>
        <CardDescription>Link your league members to their ESPN teams for score syncing.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-red-600">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {league.members?.map((member: any) => (
              <div key={member.id} className="flex items-center justify-between gap-4 p-3 bg-muted rounded-lg" data-testid={`espn-mapping-${member.id}`}>
                <div>
                  <p className="font-medium text-sm">{member.teamName}</p>
                  <p className="text-xs text-muted-foreground">User {member.userId.slice(0, 8)}...</p>
                </div>
                <Select 
                  value={member.externalTeamId || ""} 
                  onValueChange={(value) => updateMapping.mutate({ memberId: member.id, espnTeamId: value })}
                >
                  <SelectTrigger className="w-[200px]" data-testid={`select-espn-team-${member.id}`}>
                    <SelectValue placeholder="Select ESPN Team" />
                  </SelectTrigger>
                  <SelectContent>
                    {espnTeams?.teams?.map((team: any) => (
                      <SelectItem key={team.id} value={String(team.id)}>
                        {team.name || team.abbrev}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SendRemindersForm({ league }: { league: any }) {
  const { toast } = useToast();
  const [reminderType, setReminderType] = useState("weekly");

  const unpaidMembers = league.members?.filter((m: any) => m.paidStatus === 'unpaid') || [];
  const membersWithPhone = unpaidMembers.filter((m: any) => m.phoneNumber);

  const sendReminders = useMutation({
    mutationFn: async (type: string) => {
      const response = await apiRequest('POST', `/api/leagues/${league.id}/send-reminders`, { type });
      return response.json();
    },
    onSuccess: (data) => {
      let description = '';
      if (data.twilioConfigured && data.smsSent > 0) {
        description = `Sent ${data.smsSent} SMS reminder(s) to unpaid members.`;
      } else if (data.twilioConfigured && data.smsSent === 0) {
        description = `Created ${data.remindersCreated} reminder(s). No SMS sent (no phone numbers on file).`;
      } else {
        description = `Created ${data.remindersCreated} reminder(s). SMS requires Twilio setup.`;
      }
      toast({
        title: "Reminders Processed",
        description,
      });
    },
    onError: () => {
      toast({
        title: "Failed to Send",
        description: "Could not send reminders. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSend = () => {
    if (unpaidMembers.length === 0) {
      toast({
        title: "No Unpaid Members",
        description: "All members have paid their dues.",
      });
      return;
    }
    sendReminders.mutate(reminderType);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Reminder Type</Label>
        <Select value={reminderType} onValueChange={setReminderType}>
          <SelectTrigger data-testid="select-reminder-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pre_season">Pre-Season Reminder</SelectItem>
            <SelectItem value="weekly">Weekly Reminder</SelectItem>
            <SelectItem value="final">Final Notice</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
        <p className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <span><strong>{unpaidMembers.length}</strong> unpaid member(s)</span>
        </p>
        <p className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          <span><strong>{membersWithPhone.length}</strong> with phone numbers</span>
        </p>
      </div>

      {membersWithPhone.length === 0 && unpaidMembers.length > 0 && (
        <p className="text-xs text-yellow-600">
          No phone numbers on file. Add phone numbers to members to send SMS reminders.
        </p>
      )}

      <Button 
        className="w-full" 
        onClick={handleSend}
        disabled={sendReminders.isPending || unpaidMembers.length === 0}
        data-testid="button-send-reminders"
      >
        {sendReminders.isPending ? (
          "Sending..."
        ) : (
          <>
            <MessageSquare className="w-4 h-4 mr-2" />
            Send Reminders ({unpaidMembers.length})
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        SMS notifications require Twilio to be configured.
      </p>
    </div>
  );
}
