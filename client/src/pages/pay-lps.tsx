import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, CreditCard, Trophy, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function PayLps() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const { data: lpsPayment, isLoading, error } = useQuery({
    queryKey: ['/api/lps-payment', token],
    queryFn: async () => {
      const res = await fetch(`/api/lps-payment/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to load payment details');
      }
      return res.json();
    },
    enabled: !!token,
    retry: false
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/lps-payment/${token}/pay`, {});
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Payment failed' }));
        throw new Error(errorData.message || 'Could not process payment');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Successful",
        description: "Your lowest scorer fee has been paid.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Payment Failed",
        description: err.message || "Could not process payment. Please try again.",
        variant: "destructive",
      });
    }
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Invalid Payment Link</CardTitle>
            <CardDescription>This payment link is invalid or has expired.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !lpsPayment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Payment Not Found</CardTitle>
            <CardDescription>
              {(error as any)?.message || "This payment request was not found or has already been completed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (payMutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Payment Complete</CardTitle>
            <CardDescription>
              Your Week {lpsPayment.week} lowest scorer fee has been paid successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/dashboard">
              <Button data-testid="button-go-to-dashboard">
                Go to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-8 w-8 text-yellow-600" />
          </div>
          <CardTitle>Lowest Score Fee Payment</CardTitle>
          <CardDescription>
            Week {lpsPayment.week} - {lpsPayment.leagueName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-1">Amount Due</p>
            <p className="text-3xl font-bold" data-testid="text-lps-amount">${Number(lpsPayment.amount).toFixed(2)}</p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg flex items-center gap-3">
            <CreditCard className="w-6 h-6" />
            <div className="text-sm">
              <p className="font-medium">Secure Payment</p>
              <p className="text-muted-foreground">Your payment is processed securely.</p>
            </div>
          </div>

          <Button 
            className="w-full" 
            size="lg"
            onClick={() => payMutation.mutate()}
            disabled={payMutation.isPending}
            data-testid="button-pay-lps"
          >
            {payMutation.isPending ? "Processing..." : `Pay $${Number(lpsPayment.amount).toFixed(2)}`}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By paying, you acknowledge you had the lowest score for Week {lpsPayment.week}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
