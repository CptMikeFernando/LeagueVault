import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wallet, ArrowDownLeft, ArrowUpRight, Building, Zap, Clock, AlertCircle, CreditCard, Check, ExternalLink, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";

interface MemberWallet {
  id: number;
  leagueId: number;
  userId: string;
  availableBalance: string;
  pendingBalance: string;
  totalEarnings: string;
  totalWithdrawn: string;
  leagueName: string;
}

interface WalletTransaction {
  id: number;
  walletId: number;
  type: 'credit' | 'debit';
  amount: string;
  sourceType: string;
  description: string;
  balanceAfter: string;
  createdAt: string;
}

interface WithdrawalRequest {
  id: number;
  amount: string;
  payoutType: string;
  feeAmount: string;
  netAmount: string;
  status: string;
  requestedAt: string;
}

export default function MyWallet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawType, setWithdrawType] = useState<'standard' | 'instant'>('standard');
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  const { data: wallets = [], isLoading: walletsLoading } = useQuery<MemberWallet[]>({
    queryKey: ['/api/wallets/me'],
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

  const verifyConnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect/verify", {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.verified) {
        toast({ title: "Bank account connected!", description: "You can now receive payouts." });
        refetchConnectStatus();
      }
    }
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connectParam = urlParams.get('connect');
    if (connectParam === 'success') {
      verifyConnectMutation.mutate();
      window.history.replaceState({}, '', '/wallet');
    } else if (connectParam === 'refresh') {
      toast({ title: "Onboarding incomplete", description: "Please complete the bank connection process.", variant: "destructive" });
      window.history.replaceState({}, '', '/wallet');
    }
  }, []);

  const { data: withdrawals = [], isLoading: withdrawalsLoading } = useQuery<WithdrawalRequest[]>({
    queryKey: ['/api/withdrawals/me'],
  });

  const withdrawMutation = useMutation({
    mutationFn: async ({ walletId, amount, payoutType }: { walletId: number; amount: number; payoutType: string }) => {
      const res = await apiRequest("POST", `/api/wallets/${walletId}/withdraw`, { amount, payoutType });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Withdrawal initiated", description: "Your funds are on their way!" });
      queryClient.invalidateQueries({ queryKey: ['/api/wallets/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/withdrawals/me'] });
      setWithdrawDialogOpen(false);
      setWithdrawAmount("");
    },
    onError: (err: any) => {
      toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" });
    }
  });

  const handleWithdraw = () => {
    if (!selectedWalletId || !withdrawAmount) return;
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    withdrawMutation.mutate({ walletId: selectedWalletId, amount, payoutType: withdrawType });
  };

  const totalAvailable = wallets.reduce((sum, w) => sum + Number(w.availableBalance), 0);
  const totalEarnings = wallets.reduce((sum, w) => sum + Number(w.totalEarnings), 0);
  const totalWithdrawn = wallets.reduce((sum, w) => sum + Number(w.totalWithdrawn), 0);

  const selectedWallet = wallets.find(w => w.id === selectedWalletId);
  const instantFee = selectedWallet && withdrawAmount 
    ? (parseFloat(withdrawAmount) * 0.025).toFixed(2) 
    : "0.00";
  const netAmountInstant = selectedWallet && withdrawAmount 
    ? (parseFloat(withdrawAmount) - parseFloat(instantFee)).toFixed(2) 
    : "0.00";

  if (walletsLoading) {
    return (
      <div className="space-y-6 p-6">
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

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-wallet-title">My Wallet</h1>
          <p className="text-muted-foreground">Manage your fantasy league winnings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card data-testid="card-total-available">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-total-available">${totalAvailable.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Across {wallets.length} league{wallets.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-earnings">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earnings">${totalEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">All-time winnings</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-withdrawn">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Withdrawn</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-withdrawn">${totalWithdrawn.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Successfully transferred</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="wallets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="wallets" data-testid="tab-wallets">League Wallets</TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">Withdrawal History</TabsTrigger>
          <TabsTrigger value="payment-settings" data-testid="tab-payment-settings">Payment Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="wallets" className="space-y-4">
          {wallets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">No wallet balances yet. Join a league and start earning!</p>
                <Link href="/dashboard">
                  <Button className="mt-4" data-testid="button-find-leagues">Find Leagues</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {wallets.map(wallet => (
                <Card key={wallet.id} data-testid={`card-wallet-${wallet.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                    <div>
                      <CardTitle className="text-lg">{wallet.leagueName}</CardTitle>
                      <CardDescription>League Wallet</CardDescription>
                    </div>
                    <Dialog open={withdrawDialogOpen && selectedWalletId === wallet.id} onOpenChange={(open) => {
                      setWithdrawDialogOpen(open);
                      if (open) setSelectedWalletId(wallet.id);
                    }}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="default"
                          disabled={Number(wallet.availableBalance) <= 0}
                          data-testid={`button-withdraw-${wallet.id}`}
                        >
                          Withdraw Funds
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Withdraw Funds</DialogTitle>
                          <DialogDescription>
                            Transfer winnings from {wallet.leagueName} to your bank account.
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                          <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                            <span className="text-sm text-muted-foreground">Available Balance</span>
                            <span className="font-bold text-green-600">${Number(wallet.availableBalance).toFixed(2)}</span>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="amount">Withdrawal Amount</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0"
                                max={wallet.availableBalance}
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                className="pl-6"
                                placeholder="0.00"
                                data-testid="input-withdraw-amount"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Payout Speed</Label>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => setWithdrawType('standard')}
                                className={`p-4 rounded-md border text-left ${withdrawType === 'standard' ? 'border-primary bg-primary/5' : 'border-border'}`}
                                data-testid="button-payout-standard"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Clock className="h-4 w-4" />
                                  <span className="font-medium">Standard</span>
                                </div>
                                <p className="text-xs text-muted-foreground">3-5 business days</p>
                                <p className="text-sm font-bold text-green-600 mt-1">Free</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => setWithdrawType('instant')}
                                className={`p-4 rounded-md border text-left ${withdrawType === 'instant' ? 'border-primary bg-primary/5' : 'border-border'}`}
                                data-testid="button-payout-instant"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Zap className="h-4 w-4" />
                                  <span className="font-medium">Instant</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Within minutes</p>
                                <p className="text-sm font-medium text-amber-600 mt-1">2.5% fee</p>
                              </button>
                            </div>
                          </div>

                          {withdrawType === 'instant' && withdrawAmount && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                                <div className="text-sm">
                                  <p className="font-medium text-amber-800 dark:text-amber-200">Instant Payout Fee</p>
                                  <p className="text-amber-700 dark:text-amber-300">
                                    Fee: ${instantFee} | You&apos;ll receive: ${netAmountInstant}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <DialogFooter>
                          <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)} data-testid="button-cancel-withdraw">
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleWithdraw}
                            disabled={withdrawMutation.isPending || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                            data-testid="button-confirm-withdraw"
                          >
                            {withdrawMutation.isPending ? "Processing..." : `Withdraw ${withdrawType === 'instant' ? '$' + netAmountInstant : '$' + withdrawAmount}`}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-green-600" data-testid={`text-available-${wallet.id}`}>${Number(wallet.availableBalance).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Available</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold" data-testid={`text-earnings-${wallet.id}`}>${Number(wallet.totalEarnings).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Total Earned</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold" data-testid={`text-withdrawn-${wallet.id}`}>${Number(wallet.totalWithdrawn).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Withdrawn</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal History</CardTitle>
              <CardDescription>Your past withdrawal requests and their status</CardDescription>
            </CardHeader>
            <CardContent>
              {withdrawalsLoading ? (
                <Skeleton className="h-48" />
              ) : withdrawals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Building className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No withdrawals yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Fee</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals.map(withdrawal => (
                        <TableRow key={withdrawal.id} data-testid={`row-withdrawal-${withdrawal.id}`}>
                          <TableCell>{format(new Date(withdrawal.requestedAt), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-medium">${Number(withdrawal.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={withdrawal.payoutType === 'instant' ? 'default' : 'secondary'}>
                              {withdrawal.payoutType === 'instant' ? 'Instant' : 'Standard'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">${Number(withdrawal.feeAmount).toFixed(2)}</TableCell>
                          <TableCell className="font-medium text-green-600">${Number(withdrawal.netAmount).toFixed(2)}</TableCell>
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

        <TabsContent value="payment-settings" className="space-y-4">
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
                    data-testid="button-connect-bank"
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
