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
import { Wallet, ArrowDownLeft, ArrowUpRight, Building, Zap, Clock, AlertCircle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

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
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawType, setWithdrawType] = useState<'standard' | 'instant'>('standard');
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  const { data: wallets = [], isLoading: walletsLoading } = useQuery<MemberWallet[]>({
    queryKey: ['/api/wallets/me'],
  });

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
      </Tabs>
    </div>
  );
}
