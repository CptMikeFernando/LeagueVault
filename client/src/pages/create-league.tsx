import { useCreateLeague } from "@/hooks/use-leagues";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLeagueSchema } from "@shared/schema";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";

// Extend the schema to handle the jsonb settings field flatly in the form
const formSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  seasonYear: z.coerce.number().min(2020),
  seasonDues: z.coerce.number().min(0),
  weeklyPayoutAmount: z.coerce.number().min(0),
  payoutRules: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateLeague() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const createLeague = useCreateLeague();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      seasonYear: new Date().getFullYear(),
      seasonDues: 50,
      weeklyPayoutAmount: 0,
    }
  });

  const onSubmit = (data: FormData) => {
    if (!user) return;

    createLeague.mutate({
      name: data.name,
      seasonYear: data.seasonYear,
      commissionerId: user.id, // Will be validated by backend auth context usually, but schema requires it
      platform: "custom",
      settings: {
        seasonDues: data.seasonDues,
        weeklyPayoutAmount: data.weeklyPayoutAmount,
        payoutRules: data.payoutRules || "",
      },
    }, {
      onSuccess: () => setLocation("/")
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create New League</h1>
        <p className="text-muted-foreground">Set up your league finances and invite your members.</p>
      </div>

      <Card className="border-t-4 border-t-primary shadow-lg">
        <CardHeader>
          <CardTitle>League Details</CardTitle>
          <CardDescription>Basic information about your fantasy league.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">League Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. Sunday Gridiron Glory" 
                  {...register("name")} 
                  className="text-lg"
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="seasonYear">Season Year</Label>
                  <Input 
                    id="seasonYear" 
                    type="number" 
                    {...register("seasonYear")} 
                  />
                  {errors.seasonYear && <p className="text-sm text-destructive">{errors.seasonYear.message}</p>}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Financial Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="seasonDues">Entry Fee (Per Person)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input 
                      id="seasonDues" 
                      type="number" 
                      className="pl-8 font-mono"
                      {...register("seasonDues")} 
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Total required payment per member.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weeklyPayoutAmount">Weekly High Score Payout</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input 
                      id="weeklyPayoutAmount" 
                      type="number" 
                      className="pl-8 font-mono"
                      {...register("weeklyPayoutAmount")} 
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Amount paid out automatically each week (optional).</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payoutRules">Payout Distribution Rules</Label>
                <Textarea 
                  id="payoutRules" 
                  placeholder="e.g. 1st Place: 60%, 2nd Place: 30%, 3rd Place: 10%"
                  className="min-h-[100px]"
                  {...register("payoutRules")} 
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-4">
              <Button type="button" variant="ghost" onClick={() => setLocation("/")}>Cancel</Button>
              <Button type="submit" size="lg" disabled={createLeague.isPending}>
                {createLeague.isPending ? "Creating..." : "Create League"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
