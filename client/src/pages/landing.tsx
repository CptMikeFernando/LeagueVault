import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Shield, Trophy, Wallet } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const features = [
    {
      title: "Secure Payments",
      description: "Bank-level security for all league dues collection.",
      icon: Shield
    },
    {
      title: "Automated Payouts",
      description: "Set rules for weekly high scores and instant transfers.",
      icon: Wallet
    },
    {
      title: "Platform Sync",
      description: "Import rosters directly from ESPN and Yahoo Fantasy.",
      icon: Trophy
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          {/* Unsplash image of stadium lights at night */}
          {/* <!-- decorative background --> */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/5 z-0" />
          <img 
            src="https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=2069&auto=format&fit=crop"
            alt="Stadium Background"
            className="w-full h-full object-cover opacity-10 mix-blend-overlay"
          />
        </div>

        <div className="container relative z-10 mx-auto px-4 py-24 md:py-32 flex flex-col items-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium bg-background/50 backdrop-blur mb-6">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
              The #1 Way to Manage Fantasy Finances
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-foreground mb-6 leading-tight">
              Play for Glory.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                We'll Handle the Gold.
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              LeagueVault makes collecting dues and issuing payouts effortless. 
              Connect your league, secure the pot, and focus on winning.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
              <Button 
                size="lg" 
                className="h-12 px-8 text-lg rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1"
                onClick={() => window.location.href = "/api/login"}
              >
                Start Your League
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="h-12 px-8 text-lg rounded-full"
                onClick={() => window.location.href = "/api/login"}
                data-testid="button-join-league"
              >
                Join A League
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Trust Section */}
      <div className="bg-muted/50 py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-display font-bold mb-12">Trusted by Commissioners Everywhere</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[1, 2, 3].map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="text-4xl font-bold text-primary font-mono mb-2">
                  {i === 0 ? "$10M+" : i === 1 ? "50k+" : "99.9%"}
                </div>
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {i === 0 ? "Secured Funds" : i === 1 ? "Active Leagues" : "Uptime"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
