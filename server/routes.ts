import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === LEAGUES ===
  app.get(api.leagues.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const leagues = await storage.getUserLeagues(userId);
    res.json(leagues);
  });

  app.post(api.leagues.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.leagues.create.input.parse(req.body);
      const userId = req.user.claims.sub;
      
      const league = await storage.createLeague({
        ...input,
        commissionerId: userId,
        settings: input.settings || { weeklyPayoutAmount: 0, seasonDues: 0, payoutRules: "" }
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get(api.leagues.get.path, isAuthenticated, async (req, res) => {
    const league = await storage.getLeague(Number(req.params.id));
    if (!league) return res.status(404).json({ message: "League not found" });
    res.json(league);
  });

  // === INTEGRATIONS (Mock) ===
  app.post(api.leagues.syncPlatform.path, isAuthenticated, async (req, res) => {
      // Mock integration for ESPN/Yahoo
      const { platform, leagueUrl } = req.body;
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      res.json({
          success: true,
          data: {
              name: `${platform.toUpperCase()} Fantasy League`,
              seasonYear: 2025,
              externalId: "mock-ext-123"
          }
      });
  });

  // === PAYMENTS ===
  app.post(api.payments.create.path, isAuthenticated, async (req: any, res) => {
    try {
        const input = api.payments.create.input.parse(req.body);
        const userId = req.user.claims.sub;
        
        // In a real app, this would verify the Stripe payment intent first
        const payment = await storage.createPayment({
            ...input,
            userId,
            status: 'completed' // Mock successful payment
        });

        // Update member status
        const member = await storage.getLeagueMember(input.leagueId, userId);
        if (member) {
            await storage.updateMemberStatus(member.id, 'paid');
        }

        // Update league total
        await storage.updateLeagueTotalDues(input.leagueId, Number(input.amount));

        res.status(201).json(payment);
    } catch (err) {
        res.status(500).json({ message: "Payment failed" });
    }
  });

  app.get(api.payments.history.path, isAuthenticated, async (req, res) => {
      const history = await storage.getLeagueTransactions(Number(req.params.id));
      res.json(history);
  });

  // === PAYOUTS ===
  app.post(api.payouts.create.path, isAuthenticated, async (req: any, res) => {
      const input = api.payouts.create.input.parse(req.body);
      const league = await storage.getLeague(input.leagueId);
      
      // Authorization check (only commissioner)
      if (league?.commissionerId !== req.user.claims.sub) {
          return res.status(403).json({ message: "Only commissioner can issue payouts" });
      }

      const payout = await storage.createPayout({
          ...input,
          status: 'pending' // Usually requires approval or processing time
      });
      
      res.status(201).json(payout);
  });

  // === SCORES ===
  app.post(api.scores.update.path, isAuthenticated, async (req, res) => {
      const input = api.scores.update.input.parse(req.body);
      const score = await storage.addWeeklyScore(input);
      res.status(201).json(score);
  });

  return httpServer;
}

// Seed data function (can be called if DB is empty)
async function seedData() {
    // Implementation skipped for now, relying on UI creation
}
