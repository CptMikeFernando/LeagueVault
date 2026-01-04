import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, CreditCard, Trophy, ArrowLeft, LogIn, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { StripeCheckout } from "@/components/stripe-checkout";
import { useState } from "react";

export default function PayDues() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const { data: paymentData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/pay-dues', token],
    queryFn: async () => {
      const res = await fetch(`/api/pay-dues/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to load payment details');
      }
      return res.json();
    },
    enabled: !!token,
    retry: false
  });

  const linkAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/pay-dues/${token}/link-account`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to link account' }));
        throw new Error(errorData.message || 'Could not link account');
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Account Linked",
        description: "Your account has been linked to this league membership.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to Link Account",
        description: err.message,
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

  if (isLoading || authLoading) {
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

  if (error || !paymentData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Payment Not Found</CardTitle>
            <CardDescription>
              {(error as any)?.message || "This payment request was not found or has expired."}
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

  if (paymentData.alreadyPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Already Paid</CardTitle>
            <CardDescription>
              Your dues for {paymentData.leagueName} have already been paid.
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

  if (paymentSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Payment Complete</CardTitle>
            <CardDescription>
              Your dues for {paymentData.leagueName} have been paid successfully.
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
            <CardTitle>Pay League Dues</CardTitle>
            <CardDescription>
              You've been invited to pay dues for <strong>{paymentData.leagueName}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground">Amount Due</div>
              <div className="text-3xl font-bold text-primary">${paymentData.amount}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Team: {paymentData.teamName || 'Your Team'}
              </div>
            </div>
            
            <div className="text-center text-muted-foreground text-sm">
              Sign in or create an account to make your payment
            </div>
            
            <a href="/api/login" className="block">
              <Button className="w-full" size="lg" data-testid="button-login-to-pay">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In to Pay
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!paymentData.isLinked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
            <CardTitle>Link Your Account</CardTitle>
            <CardDescription>
              Connect your account to your team in <strong>{paymentData.leagueName}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground">Your Team</div>
              <div className="text-xl font-bold">{paymentData.teamName || 'Team Member'}</div>
              {paymentData.ownerName && (
                <div className="text-sm text-muted-foreground mt-1">
                  Owner: {paymentData.ownerName}
                </div>
              )}
            </div>
            
            <div className="text-center text-muted-foreground text-sm">
              Linking your account will let you manage your team and make payments.
            </div>
            
            <Button 
              className="w-full" 
              size="lg" 
              onClick={() => linkAccountMutation.mutate()}
              disabled={linkAccountMutation.isPending}
              data-testid="button-link-account"
            >
              {linkAccountMutation.isPending ? 'Linking...' : 'Link My Account'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Wallet className="h-12 w-12 text-primary mx-auto mb-4" />
          <CardTitle>Pay League Dues</CardTitle>
          <CardDescription>
            Complete your payment for <strong>{paymentData.leagueName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className="text-sm text-muted-foreground">Amount Due</div>
            <div className="text-3xl font-bold text-primary">${paymentData.amount}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Team: {paymentData.teamName || 'Your Team'}
            </div>
          </div>
          
          <StripeCheckout 
            leagueId={paymentData.leagueId}
            amount={paymentData.amount}
            leagueName={paymentData.leagueName}
            onSuccess={() => {
              setPaymentSuccess(true);
              queryClient.invalidateQueries({ queryKey: ['/api/pay-dues', token] });
            }}
          />
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
