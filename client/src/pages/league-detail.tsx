import { useLeague } from "@/hooks/use-leagues";
import { usePayments, useCreatePayment } from "@/hooks/use-payments";
import { useCreatePayout } from "@/hooks/use-payouts";
import { useUpdateScore } from "@/hooks/use-scores";
import { useAuth } from "@/hooks/use-auth";
import { useParams, Link, useLocation } from "wouter";
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
import { Textarea } from "@/components/ui/textarea";
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
  Calculator,
  Trash2,
  Send,
  Mail,
  UserPlus,
  Bell,
  X,
  Pencil,
  Check,
  ExternalLink,
  Loader2,
  Clock,
  DollarSign,
  Crown,
  ThumbsDown
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { StripeCheckout } from "@/components/stripe-checkout";

export default function LeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const leagueId = id ? parseInt(id) : 0;
  const { data: league, isLoading, error } = useLeague(leagueId);
  const { user } = useAuth();
  const [demoMemberView, setDemoMemberView] = useState(false);

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

  const isActualCommissioner = user?.id === league.commissionerId;
  const isCommissioner = isActualCommissioner && !demoMemberView;
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
            {isCommissioner && <EditLeagueNameDialog leagueId={league.id} currentName={league.name} />}
            <Badge variant="outline" className="font-mono text-xs">{league.seasonYear}</Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            Commissioner: <span className="font-medium text-foreground">{league.commissionerId === user?.id ? "You" : "Commissioner"}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isActualCommissioner && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
              <span className="text-sm text-muted-foreground">Demo Member View</span>
              <Switch 
                checked={demoMemberView} 
                onCheckedChange={setDemoMemberView}
                data-testid="switch-demo-member-view"
              />
              {demoMemberView && (
                <Badge variant="secondary" className="ml-1">Member Preview</Badge>
              )}
            </div>
          )}
          {!isMember && (
            <Link href="/dashboard">
              <Button variant="default">Join League</Button>
            </Link>
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
          <TabsTrigger value="my-wallet" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">My Wallet</TabsTrigger>
          {isCommissioner && (
            <>
              <TabsTrigger value="finances" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">Finances</TabsTrigger>
              <TabsTrigger value="treasury" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium" data-testid="tab-treasury">Treasury</TabsTrigger>
              <TabsTrigger value="tools" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium">Commish Tools</TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3 bg-transparent font-medium" data-testid="tab-settings">Settings</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* My Status - Only show when member hasn't paid */}
          {currentMember && currentMember.paidStatus !== 'paid' && (
            <Card>
              <CardHeader>
                <CardTitle>My Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-yellow-100 text-yellow-700">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">Team: {currentMember.teamName}</p>
                      <p className="text-sm text-muted-foreground">
                        Dues owed: ${league.settings?.entryFee || league.settings?.seasonDues || 0}
                      </p>
                    </div>
                  </div>
                  <PayDuesDialog league={league} userId={user!.id} amount={league.settings?.entryFee || league.settings?.seasonDues || 0} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weekly Scores - Show when member has paid */}
          {currentMember && currentMember.paidStatus === 'paid' && (
            <WeeklyScoresWidget leagueId={league.id} members={league.members} />
          )}

          {/* Row: Message Board + League Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <MessageBoard leagueId={league.id} />
            </div>
            <Card className="h-[450px]">
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
          </div>

          {/* Row: Sports Scores + Budget Forecast */}
          <div className={`grid grid-cols-1 ${isCommissioner ? 'lg:grid-cols-3' : ''} gap-6 items-end`}>
            <div className={isCommissioner ? 'lg:col-span-2' : ''}>
              <SportsScoresWidget />
            </div>
            {isCommissioner && <PayoutCalculatorCard league={league} />}
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>League Members</CardTitle>
                <CardDescription>{league.members.length} teams competing</CardDescription>
              </div>
              {isCommissioner && <RequestAllPaymentsButton leagueId={league.id} members={league.members} />}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      {isCommissioner && <TableHead>Payment Request</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {league.members.map((member: any) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isCommissioner && <EditMemberDialog leagueId={league.id} member={member} />}
                            <span className="truncate max-w-[120px]">
                              {member.ownerName || (member.user ? `${member.user.firstName || ''} ${member.user.lastName || ''}`.trim() : `User ${member.userId.slice(0,4)}...`)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]">{member.teamName}</TableCell>
                        <TableCell className="capitalize">{member.role}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={member.paidStatus === 'paid' ? 'default' : 'destructive'} 
                            className="capitalize"
                          >
                            {member.paidStatus}
                          </Badge>
                        </TableCell>
                        {isCommissioner && (
                          <TableCell>
                            <SendReminderButton leagueId={league.id} member={member} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {isCommissioner && <PendingInvitesSection leagueId={league.id} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="my-wallet">
          <MyWalletTab leagueId={leagueId} userId={user!.id} />
        </TabsContent>

        {isCommissioner && (
          <TabsContent value="finances">
            <FinancesTab league={league} />
          </TabsContent>
        )}

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
              <TransferCommissionerSection league={league} />
              <DeleteLeagueSection league={league} />
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
    <Card className="h-[450px]" data-testid="card-payout-calculator">
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
  const { toast } = useToast();

  const handleSuccess = () => {
    createPayment.mutate({
      leagueId: league.id,
      userId,
      amount: amount,
    }, {
      onSuccess: () => {
        setIsOpen(false);
        toast({
          title: "Payment Successful",
          description: "Your dues have been paid. Thank you!",
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Pay Dues</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Secure Checkout</DialogTitle>
          <DialogDescription>Pay your season dues securely via Stripe.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex justify-between items-center text-lg font-medium border-b pb-3">
             <span>Season Dues</span>
             <span className="text-primary font-bold">${amount}</span>
          </div>
          <StripeCheckout
            amount={amount}
            leagueId={league.id}
            onSuccess={handleSuccess}
            onCancel={() => setIsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IssuePayoutForm({ league }: { league: any }) {
  const createPayout = useCreatePayout();
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [payoutType, setPayoutType] = useState<'standard' | 'instant'>('standard');

  const INSTANT_FEE_PERCENT = 2.5;
  const feeAmount = payoutType === 'instant' && amount ? (Number(amount) * INSTANT_FEE_PERCENT / 100).toFixed(2) : "0.00";
  const netAmount = payoutType === 'instant' && amount ? (Number(amount) - Number(feeAmount)).toFixed(2) : amount;

  const isFormValid = recipientId && amount && Number(amount) > 0 && reason;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
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
            <SelectTrigger data-testid="select-payout-reason">
              <SelectValue placeholder="Select reason" />
            </SelectTrigger>
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
       <Button type="submit" className="w-full" disabled={createPayout.isPending || !isFormValid} data-testid="button-issue-payout">
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

function MyWalletTab({ leagueId, userId }: { leagueId: number; userId: string }) {
  const { toast } = useToast();
  
  const { data: walletData, isLoading } = useQuery({
    queryKey: ['/api/wallets', leagueId, userId],
    queryFn: async () => {
      const res = await fetch(`/api/wallets/league/${leagueId}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch wallet');
      }
      return res.json();
    }
  });

  const { data: withdrawals = [] } = useQuery<any[]>({
    queryKey: ['/api/withdrawals/me'],
  });

  const { data: connectStatus, isLoading: connectLoading, refetch: refetchConnectStatus } = useQuery<{
    hasConnectAccount: boolean;
    isOnboarded: boolean;
    accountId: string | null;
  }>({
    queryKey: ['/api/stripe/connect/status'],
  });

  const connectOnboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect/onboard", {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to start onboarding", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const wallet = walletData?.wallet;
  const transactions = walletData?.transactions || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${wallet ? Number(wallet.availableBalance).toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Ready to withdraw</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${wallet ? Number(wallet.totalEarnings).toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">All-time winnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Withdrawn</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${wallet ? Number(wallet.totalWithdrawn).toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Cash outs</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="wallet" className="space-y-4">
        <TabsList>
          <TabsTrigger value="wallet">League Wallet</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawal History</TabsTrigger>
          <TabsTrigger value="settings">Payment Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Your wallet activity in this league</CardDescription>
            </CardHeader>
            <CardContent>
              {!wallet || transactions.length === 0 ? (
                <div className="text-center py-8">
                  <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground">Earnings from payouts will appear here</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-4">
                    {transactions.map((tx: any) => (
                      <div key={tx.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                        <div>
                          <p className="font-medium text-sm">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), 'MMM d, yyyy')}</p>
                        </div>
                        <span className={`font-mono font-medium ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'credit' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal History</CardTitle>
              <CardDescription>Your past withdrawal requests and their status</CardDescription>
            </CardHeader>
            <CardContent>
              {withdrawals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Building className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No withdrawals yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals.map((withdrawal: any) => (
                        <TableRow key={withdrawal.id}>
                          <TableCell>{format(new Date(withdrawal.requestedAt), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-medium">${Number(withdrawal.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={withdrawal.payoutType === 'instant' ? 'default' : 'secondary'}>
                              {withdrawal.payoutType === 'instant' ? 'Instant' : 'Standard'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                withdrawal.status === 'completed' ? 'default' :
                                withdrawal.status === 'processing' ? 'secondary' :
                                withdrawal.status === 'failed' ? 'destructive' : 'outline'
                              }
                            >
                              {withdrawal.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Bank Account for Payouts
              </CardTitle>
              <CardDescription>
                Connect your bank account to receive winnings and payouts directly
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connectLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : connectStatus?.isOnboarded ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                    <Check className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">Bank Account Connected</p>
                      <p className="text-sm text-green-600 dark:text-green-500">You can receive payouts directly to your bank account</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => connectOnboardMutation.mutate()}
                    disabled={connectOnboardMutation.isPending}
                  >
                    {connectOnboardMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Update Bank Details
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-muted rounded-md">
                    <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="font-medium">No Bank Account Connected</p>
                      <p className="text-sm text-muted-foreground">Connect your bank to receive payouts</p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => connectOnboardMutation.mutate()}
                    disabled={connectOnboardMutation.isPending}
                  >
                    {connectOnboardMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Building className="h-4 w-4 mr-2" />
                        Connect Bank Account
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Method for Dues
              </CardTitle>
              <CardDescription>
                Cards are entered when you pay dues - no need to save them in advance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-4 bg-muted rounded-md">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">Pay-as-you-go</p>
                  <p className="text-sm text-muted-foreground">
                    When you pay league dues, you'll enter your card details securely via Stripe
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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
                {memberWallets.map((wallet: any) => (
                  <TableRow key={wallet.id} data-testid={`row-wallet-${wallet.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{wallet.memberName || `User ${wallet.userId.slice(0, 8)}`}</span>
                        {wallet.teamName && wallet.teamName !== wallet.memberName && (
                          <span className="text-xs text-muted-foreground">{wallet.teamName}</span>
                        )}
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
  
  const [isFreeLeague, setIsFreeLeague] = useState(settings.isFreeLeague || false);
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
      isFreeLeague,
      entryFee: isFreeLeague ? 0 : Number(entryFee),
      numberOfWeeks: Number(numberOfWeeks),
      firstPlacePayout: isFreeLeague ? 0 : Number(firstPlacePayout),
      secondPlacePayout: isFreeLeague ? 0 : Number(secondPlacePayout),
      thirdPlacePayout: isFreeLeague ? 0 : Number(thirdPlacePayout),
      weeklyHighScorePrize: isFreeLeague ? 0 : Number(weeklyHighScorePrize),
      weeklyLowScoreFee: isFreeLeague ? 0 : Number(weeklyLowScoreFee),
      weeklyLowScoreFeeEnabled: isFreeLeague ? false : weeklyLowScoreFeeEnabled,
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
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-0.5">
                <Label htmlFor="freeLeague" className="text-base font-medium">Free League</Label>
                <p className="text-sm text-muted-foreground">Toggle on if this league has no dues or payouts</p>
              </div>
              <Switch 
                id="freeLeague"
                checked={isFreeLeague}
                onCheckedChange={setIsFreeLeague}
                data-testid="switch-free-league"
              />
            </div>

            {!isFreeLeague && (
            <>
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
            </>
            )}

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

function TransferCommissionerSection({ league }: { league: any }) {
  const { toast } = useToast();
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  const otherMembers = league.members?.filter((m: any) => m.role !== 'commissioner') || [];

  const transferCommissioner = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/leagues/${league.id}/transfer-commissioner`, {
        newCommissionerId: selectedMemberId
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to transfer');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', league.id] });
      toast({ title: "Commissioner Transferred", description: "The commissioner role has been transferred." });
      setIsOpen(false);
      setSelectedMemberId("");
    },
    onError: (err: any) => {
      toast({ title: "Transfer Failed", description: err.message, variant: "destructive" });
    }
  });

  const selectedMember = otherMembers.find((m: any) => m.userId === selectedMemberId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Transfer Commissioner
        </CardTitle>
        <CardDescription>
          Transfer your commissioner role to another league member.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {otherMembers.length === 0 ? (
          <p className="text-muted-foreground">No other members to transfer to. Invite members first.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Select New Commissioner</Label>
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger data-testid="select-new-commissioner">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {otherMembers.map((member: any) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.teamName} ({member.user?.firstName || member.userId.slice(0, 8)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
              <AlertDialogTrigger asChild>
                <Button disabled={!selectedMemberId} data-testid="button-transfer-commissioner">
                  Transfer Commissioner Role
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Transfer Commissioner Role?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You are about to transfer your commissioner role to <strong>{selectedMember?.teamName}</strong>.
                    You will become a regular member and lose access to commissioner features. This action cannot be undone by you.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => transferCommissioner.mutate()}
                    disabled={transferCommissioner.isPending}
                    data-testid="button-confirm-transfer"
                  >
                    {transferCommissioner.isPending ? 'Transferring...' : 'Confirm Transfer'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteLeagueSection({ league }: { league: any }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [confirmName, setConfirmName] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const deleteLeague = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${league.id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues'] });
      toast({
        title: "League Deleted",
        description: "The league has been permanently deleted.",
      });
      navigate('/dashboard');
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Could not delete the league. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleDelete = () => {
    if (confirmName === league.name) {
      deleteLeague.mutate();
    }
  };

  const isNameMatch = confirmName === league.name;

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="w-5 h-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          Permanently delete this league and all its data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="button-delete-league">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete League
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  This will permanently delete <strong>{league.name}</strong> and all associated data including:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>All member records and wallet balances</li>
                  <li>All payment and payout history</li>
                  <li>All weekly scores and transactions</li>
                </ul>
                <p className="font-medium text-destructive">
                  This action cannot be undone.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="confirmName">
                Type <strong>{league.name}</strong> to confirm:
              </Label>
              <Input
                id="confirmName"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder="Enter league name"
                data-testid="input-confirm-league-name"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmName("")}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!isNameMatch || deleteLeague.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteLeague.isPending ? "Deleting..." : "Delete Forever"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function RequestAllPaymentsButton({ leagueId, members }: { leagueId: number; members: any[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [contactInfo, setContactInfo] = useState<Record<number, { email: string; phone: string }>>({});
  const [isSaving, setIsSaving] = useState(false);

  const unpaidMembers = members.filter(m => m.paidStatus !== 'paid');
  const membersWithoutContact = unpaidMembers.filter(m => !m.email && !m.phoneNumber);

  const handleOpenDialog = () => {
    const initial: Record<number, { email: string; phone: string }> = {};
    membersWithoutContact.forEach(m => {
      initial[m.id] = { email: '', phone: '' };
    });
    setContactInfo(initial);
    setOpen(true);
  };

  const updateMemberContact = useMutation({
    mutationFn: async ({ memberId, email, phone }: { memberId: number; email: string; phone: string }) => {
      const res = await apiRequest('PATCH', `/api/leagues/${leagueId}/members/${memberId}`, {
        email: email.trim() || null,
        phoneNumber: phone.trim() || null
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update member');
      }
      return res.json();
    }
  });

  const requestAllPayments = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/leagues/${leagueId}/request-all-payments`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to request payments');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      toast({ 
        title: "Payment requests sent!", 
        description: `Sent ${data.sentCount} payment request${data.sentCount !== 1 ? 's' : ''}. ${data.skippedCount} member${data.skippedCount !== 1 ? 's' : ''} had no contact info.`
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  });

  const handleSendRequests = async () => {
    setIsSaving(true);
    try {
      const updates = Object.entries(contactInfo)
        .filter(([_, info]) => info.email || info.phone)
        .map(([memberId, info]) => 
          updateMemberContact.mutateAsync({ memberId: Number(memberId), email: info.email, phone: info.phone })
        );
      
      if (updates.length > 0) {
        await Promise.all(updates);
        await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      }
      
      requestAllPayments.mutate();
    } catch (err: any) {
      toast({ title: "Failed to save contact info", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectSend = () => {
    if (membersWithoutContact.length > 0) {
      handleOpenDialog();
    } else {
      requestAllPayments.mutate();
    }
  };

  return (
    <>
      <Button 
        onClick={handleDirectSend}
        disabled={requestAllPayments.isPending}
        data-testid="button-request-all-payments"
      >
        <DollarSign className="w-4 h-4 mr-2" />
        {requestAllPayments.isPending ? 'Sending...' : 'Request All Payments'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Missing Contact Info</DialogTitle>
            <DialogDescription>
              The following unpaid members don't have email or phone numbers. Add their contact info to send payment requests.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {membersWithoutContact.map((member) => (
              <div key={member.id} className="border rounded-md p-3 space-y-2">
                <div>
                  <p className="font-medium text-sm">{member.ownerName || 'Unknown Member'}</p>
                  {member.teamName && <p className="text-xs text-muted-foreground">{member.teamName}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={contactInfo[member.id]?.email || ''}
                      onChange={(e) => setContactInfo(prev => ({
                        ...prev,
                        [member.id]: { ...prev[member.id], email: e.target.value }
                      }))}
                      data-testid={`input-member-email-${member.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <Input
                      type="tel"
                      placeholder="+1234567890"
                      value={contactInfo[member.id]?.phone || ''}
                      onChange={(e) => setContactInfo(prev => ({
                        ...prev,
                        [member.id]: { ...prev[member.id], phone: e.target.value }
                      }))}
                      data-testid={`input-member-phone-${member.id}`}
                    />
                  </div>
                </div>
              </div>
            ))}
            {membersWithoutContact.length === 0 && (
              <p className="text-muted-foreground text-center py-4">All unpaid members have contact info!</p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSendRequests}
              disabled={isSaving || requestAllPayments.isPending}
            >
              {isSaving ? 'Saving...' : requestAllPayments.isPending ? 'Sending...' : 'Save & Send Requests'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditMemberDialog({ leagueId, member }: { leagueId: number; member: any }) {
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(member.teamName || '');
  const [ownerName, setOwnerName] = useState(member.ownerName || '');
  const [phoneNumber, setPhoneNumber] = useState(member.phoneNumber || '');
  const [email, setEmail] = useState(member.email || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();

  const updateMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/leagues/${leagueId}/members/${member.id}`, {
        teamName: teamName.trim() || null,
        ownerName: ownerName.trim() || null,
        phoneNumber: phoneNumber.trim() || null,
        email: email.trim() || null
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      toast({ title: "Member updated", description: "Member details have been saved." });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    }
  });

  const deleteMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/leagues/${leagueId}/members/${member.id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to remove member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      toast({ title: "Member removed", description: "Member has been removed from the league." });
      setOpen(false);
      setShowDeleteConfirm(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
      setShowDeleteConfirm(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen) {
        setTeamName(member.teamName || '');
        setOwnerName(member.ownerName || '');
        setPhoneNumber(member.phoneNumber || '');
        setEmail(member.email || '');
        setShowDeleteConfirm(false);
      }
    }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-edit-member-${member.id}`}>
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>Update member contact information and details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Team Name</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team Name"
                data-testid="input-edit-team-name"
              />
            </div>
            <div>
              <Label>Owner Name</Label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Owner Name"
                data-testid="input-edit-owner-name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone Number</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                data-testid="input-edit-phone"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                type="email"
                data-testid="input-edit-email"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between gap-2">
          <div>
            {!showDeleteConfirm ? (
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-member"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Member
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive">Are you sure?</span>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => deleteMember.mutate()}
                  disabled={deleteMember.isPending}
                  data-testid="button-confirm-delete-member"
                >
                  {deleteMember.isPending ? 'Removing...' : 'Yes, Remove'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="button-cancel-delete-member"
                >
                  No
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateMember.mutate()}
              disabled={updateMember.isPending}
              data-testid="button-save-member"
            >
              {updateMember.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLeagueNameDialog({ leagueId, currentName }: { leagueId: number; currentName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const { toast } = useToast();

  const updateName = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/leagues/${leagueId}/name`, { name: name.trim() });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update league name');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      toast({ title: "League updated", description: "League name has been changed." });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen) setName(currentName);
    }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-edit-league-name">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit League Name</DialogTitle>
          <DialogDescription>Change the name of your league.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>League Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="League Name"
            data-testid="input-edit-league-name"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => updateName.mutate()}
            disabled={!name.trim() || updateName.isPending}
            data-testid="button-save-league-name"
          >
            {updateName.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendReminderButton({ leagueId, member }: { leagueId: number; member: any }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(member.phoneNumber || "");
  const [email, setEmail] = useState(member.email || "");
  const [sendMethod, setSendMethod] = useState<'sms' | 'email' | null>(null);

  const updateAndSend = useMutation({
    mutationFn: async ({ method, phone, emailAddr }: { method: 'sms' | 'email'; phone?: string; emailAddr?: string }) => {
      // First update contact info if provided
      if (phone || emailAddr) {
        const updateRes = await apiRequest('PATCH', `/api/leagues/${leagueId}/members/${member.id}`, {
          phoneNumber: phone || member.phoneNumber,
          email: emailAddr || member.email
        });
        if (!updateRes.ok) {
          const data = await updateRes.json();
          throw new Error(data.message || 'Failed to update contact info');
        }
      }
      
      // Then send the reminder
      const res = await apiRequest('POST', `/api/leagues/${leagueId}/members/${member.id}/remind`, { method });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to send reminder');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setOpen(false);
      setSendMethod(null);
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      toast({ title: "Reminder sent!", description: `Payment reminder sent via ${data.method === 'sms' ? 'SMS' : 'Email'}` });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  });

  const handleSend = (method: 'sms' | 'email') => {
    if (method === 'sms' && !phoneNumber) {
      setSendMethod('sms');
      return;
    }
    if (method === 'email' && !email) {
      setSendMethod('email');
      return;
    }
    updateAndSend.mutate({ 
      method, 
      phone: method === 'sms' ? phoneNumber : undefined,
      emailAddr: method === 'email' ? email : undefined
    });
  };

  const handleSubmitContact = () => {
    if (sendMethod === 'sms' && phoneNumber) {
      updateAndSend.mutate({ method: 'sms', phone: phoneNumber });
    } else if (sendMethod === 'email' && email) {
      updateAndSend.mutate({ method: 'email', emailAddr: email });
    }
  };

  const hasPhone = !!member.phoneNumber;
  const hasEmail = !!member.email;

  if (member.paidStatus === 'paid') {
    return <span className="text-sm text-green-600 font-medium">Paid</span>;
  }

  // Show "Sent" if payment request was sent within last 24 hours
  const isRecentRequest = member.paymentRequestSent && member.paymentRequestSentAt && 
    (new Date().getTime() - new Date(member.paymentRequestSentAt).getTime()) < 24 * 60 * 60 * 1000;
  
  if (isRecentRequest) {
    return (
      <Badge className="bg-green-600 text-white" data-testid={`badge-sent-${member.id}`}>
        Sent
      </Badge>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSendMethod(null); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid={`button-remind-${member.id}`}
        >
          Request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Payment Reminder</DialogTitle>
          <DialogDescription>
            Send a reminder to {member.ownerName || member.teamName}
          </DialogDescription>
        </DialogHeader>
        
        {!sendMethod ? (
          <div className="flex flex-col gap-3 py-4">
            <Button
              variant="outline"
              className="justify-start gap-3"
              onClick={() => handleSend('sms')}
              disabled={updateAndSend.isPending}
              data-testid="button-remind-sms"
            >
              <Phone className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Send SMS</div>
                <div className="text-sm text-muted-foreground">
                  {hasPhone ? member.phoneNumber : 'Add phone number'}
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-3"
              onClick={() => handleSend('email')}
              disabled={updateAndSend.isPending}
              data-testid="button-remind-email"
            >
              <Mail className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Send Email</div>
                <div className="text-sm text-muted-foreground">
                  {hasEmail ? member.email : 'Add email address'}
                </div>
              </div>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {sendMethod === 'sms' ? (
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="+1 (555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  data-testid="input-remind-phone"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="member@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-remind-email"
                />
              </div>
            )}
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setSendMethod(null)}>Back</Button>
              <Button 
                onClick={handleSubmitContact}
                disabled={updateAndSend.isPending || (sendMethod === 'sms' ? !phoneNumber : !email)}
                data-testid="button-submit-remind"
              >
                {updateAndSend.isPending ? 'Sending...' : 'Send Reminder'}
              </Button>
            </DialogFooter>
          </div>
        )}
        
        {updateAndSend.isPending && !sendMethod && (
          <div className="text-center text-sm text-muted-foreground">Sending...</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PendingInvitesSection({ leagueId }: { leagueId: number }) {
  const { toast } = useToast();
  const { data: invites, isLoading } = useQuery<any[]>({
    queryKey: ['/api/leagues', leagueId, 'invites'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/invites`);
      return res.json();
    }
  });

  const cancelInvite = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest('DELETE', `/api/leagues/${leagueId}/invites/${inviteId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to cancel invite');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'invites'] });
      toast({ title: "Invite cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to cancel invite", description: err.message, variant: "destructive" });
    }
  });

  const pendingInvites = invites?.filter(i => i.status === 'pending' || i.status === 'sent') || [];

  if (isLoading || pendingInvites.length === 0) return null;

  return (
    <div className="pt-4 border-t">
      <h4 className="font-medium mb-3">Pending Invites</h4>
      <div className="space-y-2">
        {pendingInvites.map((invite: any) => (
          <div key={invite.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-md">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {invite.contactType === 'phone' ? (
                <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="text-sm truncate">{invite.ownerName || invite.contactValue}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{invite.status}</Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => cancelInvite.mutate(invite.id)}
                disabled={cancelInvite.isPending}
                data-testid={`button-cancel-invite-${invite.id}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBoard({ leagueId }: { leagueId: number }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'messages'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/messages`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const postMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/leagues/${leagueId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to post message');
      }
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'messages'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await fetch(`/api/leagues/${leagueId}/messages/${messageId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to delete message');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'messages'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      postMessage.mutate(newMessage.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim()) {
        postMessage.mutate(newMessage.trim());
      }
    }
  };


  return (
    <Card className="h-[450px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Message Board
        </CardTitle>
        <CardDescription>Chat with your league members</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !messages || messages.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              No messages yet. Be the first to post!
            </p>
          ) : (
            <div className="space-y-4 flex flex-col-reverse">
              {messages?.map((msg: any) => (
                <div key={msg.id} className="flex gap-3 group" data-testid={`message-${msg.id}`}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {msg.user?.firstName?.[0] || msg.userId.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {msg.user?.firstName && msg.user?.lastName 
                          ? `${msg.user.firstName} ${msg.user.lastName}`
                          : 'Member'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {msg.createdAt ? format(new Date(msg.createdAt), 'MMM d, h:mm a') : ''}
                      </span>
                      {user?.id === msg.userId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 invisible group-hover:visible"
                          onClick={() => deleteMessage.mutate(msg.id)}
                          disabled={deleteMessage.isPending}
                          data-testid={`button-delete-message-${msg.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground break-words">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            placeholder="Write a message... (Enter to send, Shift+Enter for new line)"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] resize-none flex-1"
            data-testid="input-message"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!newMessage.trim() || postMessage.isPending}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function WeeklyScoresWidget({ leagueId, members }: { leagueId: number; members: any[] }) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  
  const { data, isLoading } = useQuery<{ 
    scores: any[]; 
    highestScorer: any; 
    lowestScorer: any;
    weeklyLowScoreFeeEnabled: boolean;
  }>({
    queryKey: ['/api/leagues', leagueId, 'scores', selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/leagues/${leagueId}/scores/${selectedWeek}`);
      if (!response.ok) throw new Error('Failed to fetch scores');
      return response.json();
    },
  });

  const getMemberName = (userId: string) => {
    const member = members.find(m => m.userId === userId);
    return member?.teamName || member?.ownerName || 'Unknown';
  };

  const weeks = Array.from({ length: 17 }, (_, i) => i + 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-4 h-4" />
            Weekly Scores
          </CardTitle>
          <Select value={String(selectedWeek)} onValueChange={(v) => setSelectedWeek(Number(v))}>
            <SelectTrigger className="w-[120px]" data-testid="select-week">
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              {weeks.map(w => (
                <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : data?.scores && data.scores.length > 0 ? (
          <div className="space-y-2">
            {data.scores.map((score, index) => {
              const isHighest = data.highestScorer?.userId === score.userId;
              const isLowest = data.lowestScorer?.userId === score.userId && data.weeklyLowScoreFeeEnabled;
              
              return (
                <div 
                  key={score.id || index}
                  className={`flex items-center justify-between p-2 rounded-md ${
                    isHighest ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' :
                    isLowest ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800' :
                    'bg-muted/30'
                  }`}
                  data-testid={`score-row-${index}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm w-6">{index + 1}.</span>
                    {isHighest && <Crown className="w-4 h-4 text-yellow-500" />}
                    {isLowest && <ThumbsDown className="w-4 h-4 text-red-500" />}
                    <span className="font-medium text-sm">{getMemberName(score.userId)}</span>
                  </div>
                  <span className={`font-mono text-sm font-medium ${
                    isHighest ? 'text-green-600' : isLowest ? 'text-red-600' : ''
                  }`}>
                    {Number(score.score).toFixed(2)} pts
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4 text-sm">
            No scores for Week {selectedWeek} yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface SportsGame {
  id: string;
  name: string;
  shortName: string;
  date: string;
  status: {
    type: string;
    displayClock?: string;
    period?: number;
  };
  homeTeam: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    score: string;
    winner: boolean;
  } | null;
  awayTeam: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    score: string;
    winner: boolean;
  } | null;
}

function SportsScoresWidget() {
  const [sport, setSport] = useState<'nfl' | 'cfb'>('nfl');
  
  const { data, isLoading } = useQuery<{ sport: string; week: number; season: number; games: SportsGame[] }>({
    queryKey: ['/api/sports/scores', sport],
    queryFn: async () => {
      const response = await fetch(`/api/sports/scores?sport=${sport}`);
      if (!response.ok) throw new Error('Failed to fetch scores');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const formatGameTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + 
           ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getStatusDisplay = (game: SportsGame) => {
    if (game.status.type === 'STATUS_FINAL') return 'Final';
    if (game.status.type === 'STATUS_IN_PROGRESS') {
      return `${game.status.displayClock || ''} Q${game.status.period || ''}`;
    }
    if (game.status.type === 'STATUS_SCHEDULED') {
      return formatGameTime(game.date);
    }
    return game.status.type?.replace('STATUS_', '') || '';
  };

  return (
    <Card className="h-[450px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-4 h-4" />
            Live Scores
          </CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={sport === 'nfl' ? 'default' : 'ghost'}
              onClick={() => setSport('nfl')}
              data-testid="button-nfl-scores"
            >
              NFL
            </Button>
            <Button
              size="sm"
              variant={sport === 'cfb' ? 'default' : 'ghost'}
              onClick={() => setSport('cfb')}
              data-testid="button-cfb-scores"
            >
              CFB
            </Button>
          </div>
        </div>
        {data?.week && (
          <CardDescription>Week {data.week} - {data.season} Season</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !data?.games?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No games scheduled</p>
          ) : (
            <div className="space-y-2">
              {data.games.slice(0, 10).map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-2 bg-muted/30 rounded-md text-sm"
                  data-testid={`game-${game.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {game.awayTeam?.logo && (
                        <img src={game.awayTeam.logo} alt="" className="w-4 h-4 object-contain" />
                      )}
                      <span className={game.awayTeam?.winner ? 'font-semibold' : ''}>
                        {game.awayTeam?.abbreviation || 'TBD'}
                      </span>
                      <span className="font-mono">{game.awayTeam?.score || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {game.homeTeam?.logo && (
                        <img src={game.homeTeam.logo} alt="" className="w-4 h-4 object-contain" />
                      )}
                      <span className={game.homeTeam?.winner ? 'font-semibold' : ''}>
                        {game.homeTeam?.abbreviation || 'TBD'}
                      </span>
                      <span className="font-mono">{game.homeTeam?.score || '-'}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 ml-2">
                    {getStatusDisplay(game)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
