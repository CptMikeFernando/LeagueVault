import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === LEAGUES ===
  app.get(api.leagues.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagues = await storage.getUserLeagues(userId);
      res.json(leagues);
    } catch (err) {
      console.error("Error fetching leagues:", err);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.post(api.leagues.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.leagues.create.input.parse(req.body);
      const userId = req.user.claims.sub;
      
      const league = await storage.createLeague({
        ...input,
        commissionerId: userId,
        settings: input.settings || { weeklyPayoutAmount: 0, seasonDues: 0, payoutRules: "", lowestScorerFee: 0, lowestScorerFeeEnabled: false }
      });

      // Add creator as commissioner member
      await storage.addLeagueMember({
        leagueId: league.id,
        userId: userId,
        role: 'commissioner',
        teamName: 'Commissioner Team',
        paidStatus: 'unpaid'
      });

      res.status(201).json(league);
    } catch (err) {
      console.error("Error creating league:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get(api.leagues.get.path, isAuthenticated, async (req, res) => {
    try {
      const league = await storage.getLeague(Number(req.params.id));
      if (!league) return res.status(404).json({ message: "League not found" });
      
      // Get transaction history for the league as well
      const transactions = await storage.getLeagueTransactions(league.id);
      
      res.json({
        ...league,
        payments: transactions.payments,
        payouts: transactions.payouts
      });
    } catch (err) {
      console.error("Error fetching league:", err);
      res.status(500).json({ message: "Failed to fetch league" });
    }
  });

  app.post(api.leagues.join.path, isAuthenticated, async (req: any, res) => {
    try {
      const { teamName } = req.body;
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);

      // Check if already a member
      const existing = await storage.getLeagueMember(leagueId, userId);
      if (existing) {
        return res.status(400).json({ message: "Already a member of this league" });
      }

      const member = await storage.addLeagueMember({
        leagueId,
        userId,
        role: 'member',
        teamName: teamName || 'My Team',
        paidStatus: 'unpaid'
      });

      res.status(201).json(member);
    } catch (err) {
      console.error("Error joining league:", err);
      res.status(500).json({ message: "Failed to join league" });
    }
  });

  // === INTEGRATIONS (Mock ESPN/Yahoo) ===
  app.post(api.leagues.syncPlatform.path, isAuthenticated, async (req, res) => {
    try {
      const { platform, leagueUrl } = req.body;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock response simulating ESPN/Yahoo data
      res.json({
        success: true,
        data: {
          name: `${platform.toUpperCase()} Fantasy League 2025`,
          seasonYear: 2025,
          externalId: `mock-${platform}-${Date.now()}`
        }
      });
    } catch (err) {
      console.error("Error syncing platform:", err);
      res.status(500).json({ message: "Failed to sync platform" });
    }
  });

  // === PAYMENTS ===
  app.post(api.payments.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, amount } = req.body;
      
      // Create payment record
      const payment = await storage.createPayment({
        leagueId: Number(leagueId),
        userId,
        amount: String(amount),
        status: 'completed',
        stripePaymentIntentId: null
      });

      // Update member status to paid
      const member = await storage.getLeagueMember(Number(leagueId), userId);
      if (member) {
        await storage.updateMemberStatus(member.id, 'paid');
      }

      // Update league total funds
      await storage.updateLeagueTotalDues(Number(leagueId), Number(amount));

      res.status(201).json(payment);
    } catch (err) {
      console.error("Error creating payment:", err);
      res.status(500).json({ message: "Payment failed" });
    }
  });

  app.get(api.payments.history.path, isAuthenticated, async (req, res) => {
    try {
      const history = await storage.getLeagueTransactions(Number(req.params.id));
      res.json(history);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // === PAYOUTS ===
  app.post(api.payouts.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, userId: recipientId, amount, reason, week } = req.body;
      
      // Authorization check (only commissioner)
      const league = await storage.getLeague(Number(leagueId));
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can issue payouts" });
      }

      const payout = await storage.createPayout({
        leagueId: Number(leagueId),
        userId: recipientId,
        amount: String(amount),
        reason,
        week: week || null,
        status: 'approved'
      });
      
      res.status(201).json(payout);
    } catch (err) {
      console.error("Error creating payout:", err);
      res.status(500).json({ message: "Failed to create payout" });
    }
  });

  // === SCORES ===
  app.post(api.scores.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { userId: memberId, week, score } = req.body;
      
      // Authorization check (only commissioner)
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can update scores" });
      }

      const newScore = await storage.addWeeklyScore({
        leagueId,
        userId: memberId,
        week: Number(week),
        score: String(score)
      });
      
      res.status(201).json(newScore);
    } catch (err) {
      console.error("Error updating score:", err);
      res.status(500).json({ message: "Failed to update score" });
    }
  });

  // Finalize week and process lowest scorer penalty
  app.post("/api/leagues/:id/finalize-week", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { week } = req.body;
      
      // Authorization check (only commissioner)
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can finalize weeks" });
      }

      const scores = await storage.getWeeklyScores(leagueId, Number(week));
      if (scores.length === 0) {
        return res.status(400).json({ message: "No scores recorded for this week" });
      }

      const results: any = { week: Number(week), processed: [] };

      // Process highest scorer payout if enabled
      if (league.settings?.weeklyPayoutAmount && league.settings.weeklyPayoutAmount > 0) {
        const highestScorer = scores[0];
        const payout = await storage.createPayout({
          leagueId,
          userId: highestScorer.userId,
          amount: String(league.settings.weeklyPayoutAmount),
          reason: 'weekly_high_score',
          week: Number(week),
          status: 'approved'
        });
        results.processed.push({ type: 'payout', userId: highestScorer.userId, amount: league.settings.weeklyPayoutAmount });
      }

      // Process lowest scorer penalty if enabled
      if (league.settings?.lowestScorerFeeEnabled && league.settings.lowestScorerFee > 0) {
        const lowestScorer = scores[scores.length - 1];
        const payment = await storage.createPayment({
          leagueId,
          userId: lowestScorer.userId,
          amount: String(league.settings.lowestScorerFee),
          status: 'pending',
          stripePaymentIntentId: null
        });
        results.processed.push({ type: 'penalty', userId: lowestScorer.userId, amount: league.settings.lowestScorerFee });
      }
      
      res.json({ success: true, results });
    } catch (err) {
      console.error("Error finalizing week:", err);
      res.status(500).json({ message: "Failed to finalize week" });
    }
  });

  // Get weekly scores for a league
  app.get("/api/leagues/:id/scores/:week", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const week = Number(req.params.week);
      
      const scores = await storage.getWeeklyScores(leagueId, week);
      const highestScorer = scores.length > 0 ? scores[0] : null;
      const lowestScorer = scores.length > 0 ? scores[scores.length - 1] : null;

      // Get league settings to check if lowest scorer fee is enabled
      const league = await storage.getLeague(leagueId);
      const lowestScorerFeeEnabled = league?.settings?.lowestScorerFeeEnabled || false;
      const lowestScorerFee = league?.settings?.lowestScorerFee || 0;
      
      res.json({ 
        scores, 
        highestScorer, 
        lowestScorer,
        lowestScorerFeeEnabled,
        lowestScorerFee
      });
    } catch (err) {
      console.error("Error fetching scores:", err);
      res.status(500).json({ message: "Failed to fetch scores" });
    }
  });

  // === ADMIN ===
  // Middleware to check admin status
  const isAdmin = async (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const isAdminUser = await storage.isUserAdmin(req.user.claims.sub);
    if (!isAdminUser) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Check if current user is admin
  app.get("/api/admin/check", isAuthenticated, async (req: any, res) => {
    try {
      const isAdminUser = await storage.isUserAdmin(req.user.claims.sub);
      res.json({ isAdmin: isAdminUser });
    } catch (err) {
      console.error("Error checking admin status:", err);
      res.status(500).json({ message: "Failed to check admin status" });
    }
  });

  // Get platform-wide stats
  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (err) {
      console.error("Error fetching admin stats:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Get all leagues for admin
  app.get("/api/admin/leagues", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allLeagues = await storage.getAllLeagues();
      res.json(allLeagues);
    } catch (err) {
      console.error("Error fetching all leagues:", err);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  // Make a user an admin (super_admin only - for initial setup, use database directly)
  app.post("/api/admin/promote", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user.claims.sub);
      if (currentUser?.role !== 'super_admin') {
        return res.status(403).json({ message: "Only super admin can promote users" });
      }
      
      const { userId, role } = req.body;
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      await storage.updateUserRole(userId, role);
      res.json({ success: true });
    } catch (err) {
      console.error("Error promoting user:", err);
      res.status(500).json({ message: "Failed to promote user" });
    }
  });

  // === STRIPE ===
  app.get("/api/stripe/key", async (req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (err) {
      console.error("Error fetching Stripe key:", err);
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  app.post("/api/stripe/create-payment-intent", isAuthenticated, async (req: any, res) => {
    try {
      const { amount, leagueId } = req.body;
      const stripe = await getUncachableStripeClient();
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          leagueId: String(leagueId),
          userId: req.user.claims.sub
        }
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      console.error("Error creating payment intent:", err);
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  return httpServer;
}
