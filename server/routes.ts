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

  // === INTEGRATIONS (ESPN/Yahoo) ===
  app.post(api.leagues.syncPlatform.path, isAuthenticated, async (req: any, res) => {
    try {
      const { platform, leagueUrl, espnS2, swid } = req.body;
      const userId = req.user.claims.sub;
      
      if (platform === 'espn') {
        // Parse league ID from ESPN URL
        const urlMatch = leagueUrl.match(/leagueId=(\d+)/);
        if (!urlMatch) {
          return res.status(400).json({ message: "Could not parse ESPN league ID from URL. Expected format: https://fantasy.espn.com/football/league?leagueId=XXXXXX" });
        }
        const espnLeagueId = urlMatch[1];
        // ESPN seasons run Aug-Feb, so Jan-July uses previous calendar year
        const now = new Date();
        const currentYear = now.getMonth() < 7 
          ? (now.getFullYear() - 1).toString() 
          : now.getFullYear().toString();
        
        console.log(`ESPN Import: League ID ${espnLeagueId}, Season ${currentYear}, Cookies provided: ${!!(espnS2 && swid)}`);
        
        // Fetch real league info from ESPN API
        const { fetchEspnLeagueInfo } = await import('./espn-api');
        const cookies = espnS2 && swid ? { espnS2, swid } : undefined;
        const result = await fetchEspnLeagueInfo(espnLeagueId, currentYear, cookies);
        
        console.log(`ESPN Import Result:`, result.success ? `Success - ${result.data?.teams?.length || 0} teams` : `Error - ${result.error}`);
        
        if (!result.success || !result.data) {
          return res.status(400).json({ 
            message: result.error || "Failed to fetch ESPN league data. If this is a private league, you may need to provide ESPN cookies." 
          });
        }
        
        const espnData = result.data;
        
        // Use the actual season from ESPN response
        const actualSeasonId = espnData.seasonId || parseInt(currentYear);
        
        // Create the league with real ESPN data
        const league = await storage.createLeague({
          name: espnData.name,
          commissionerId: userId,
          platform: platform,
          externalLeagueId: espnLeagueId,
          seasonYear: actualSeasonId,
          totalDues: "0",
          settings: {
            weeklyPayoutAmount: 0,
            seasonDues: 100,
            payoutRules: "Standard payout rules",
            lowestScorerFee: 0,
            lowestScorerFeeEnabled: false,
            espnLeagueId: espnLeagueId,
            espnSeasonId: actualSeasonId.toString(),
            espnPrivateLeague: !!(espnS2 && swid),
            ...(espnS2 && { espnS2 }),
            ...(swid && { espnSwid: swid })
          }
        });

        // Add the commissioner as a member (they can map to their ESPN team later)
        await storage.addLeagueMember({
          leagueId: league.id,
          userId,
          role: 'commissioner',
          teamName: 'Commissioner',
          paidStatus: 'unpaid'
        });
        
        // Create placeholder members for each ESPN team (to be mapped to real users later)
        // These use placeholder user IDs that commissioners can update through team mapping
        for (const team of espnData.teams) {
          try {
            await storage.addLeagueMember({
              leagueId: league.id,
              userId: `espn-team-${league.id}-${team.id}`,
              role: 'member',
              teamName: team.name,
              externalTeamId: team.id.toString(),
              paidStatus: 'unpaid'
            });
          } catch (err) {
            // Skip if there's a constraint violation (shouldn't happen with unique IDs)
            console.warn(`Could not add placeholder for team ${team.id}:`, err);
          }
        }

        return res.json({
          success: true,
          data: {
            name: espnData.name,
            seasonYear: espnData.seasonId,
            externalId: espnLeagueId,
            teamsImported: espnData.teams.length
          }
        });
      }
      
      // Fallback for other platforms (mock data)
      const mockData = {
        name: `${platform.toUpperCase()} Fantasy League 2025`,
        seasonYear: 2025,
        externalId: `mock-${platform}-${Date.now()}`
      };

      const league = await storage.createLeague({
        name: mockData.name,
        commissionerId: userId,
        platform: platform,
        externalLeagueId: mockData.externalId,
        seasonYear: mockData.seasonYear,
        totalDues: "0",
        settings: {
          weeklyPayoutAmount: 0,
          seasonDues: 100,
          payoutRules: "Standard payout rules",
          lowestScorerFee: 0,
          lowestScorerFeeEnabled: false
        }
      });

      await storage.addLeagueMember({
        leagueId: league.id,
        userId,
        role: 'commissioner',
        teamName: 'Commissioner Team',
        paidStatus: 'unpaid'
      });

      res.json({
        success: true,
        data: mockData
      });
    } catch (err) {
      console.error("Error syncing platform:", err);
      res.status(500).json({ message: "Failed to sync platform" });
    }
  });

  // Update league settings (commissioner only)
  app.patch(api.leagues.updateSettings.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const settingsUpdate = req.body;
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can update settings" });
      }

      // Merge new settings with existing settings
      const currentSettings = league.settings || {};
      const newSettings = { ...currentSettings, ...settingsUpdate };
      
      await storage.updateLeagueSettings(leagueId, newSettings);
      
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating settings:", err);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Delete league (commissioner only)
  app.delete(api.leagues.delete.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can delete a league" });
      }

      await storage.deleteLeague(leagueId);
      
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting league:", err);
      res.status(500).json({ message: "Failed to delete league" });
    }
  });

  // Sync scores from platform (ESPN API or mock)
  app.post(api.leagues.syncScores.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { week } = req.body;
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can sync scores" });
      }

      const members = league.members || [];
      let scoresUpdated = 0;
      const settings = league.settings || {};
      let dataSource = 'mock';
      let espnError = '';
      let espnSuccess = false;
      let unmappedMembers: string[] = [];

      // Check if ESPN is configured
      if (league.platform === 'espn' && settings.espnLeagueId) {
        const { fetchEspnScores } = await import('./espn-api');
        const seasonId = settings.espnSeasonId || new Date().getFullYear().toString();
        const cookies = settings.espnPrivateLeague ? {
          espnS2: settings.espnS2,
          swid: settings.espnSwid
        } : undefined;

        const espnResult = await fetchEspnScores(settings.espnLeagueId, seasonId, week, cookies);
        
        if (espnResult.success && espnResult.data) {
          dataSource = 'espn';
          espnSuccess = true;
          
          // Get existing scores once for efficiency
          const existingScores = await storage.getWeeklyScores(leagueId, week);
          
          for (const member of members) {
            if (member.externalTeamId) {
              const espnScore = espnResult.data.weeklyScores.get(Number(member.externalTeamId));
              if (espnScore !== undefined) {
                const hasExisting = existingScores.some(s => s.userId === member.userId);
                
                if (!hasExisting) {
                  await storage.addWeeklyScore({
                    leagueId,
                    userId: member.userId,
                    week,
                    score: String(espnScore.toFixed(2)),
                    source: 'espn'
                  });
                  scoresUpdated++;
                }
              }
            } else {
              unmappedMembers.push(member.teamName || member.userId);
            }
          }
        } else {
          espnError = espnResult.error || 'Failed to fetch ESPN scores';
          console.log(`[ESPN] Error fetching scores: ${espnError}, falling back to mock data`);
        }
      }

      // Fall back to mock scores if ESPN not configured or failed
      if (!espnSuccess) {
        const existingScores = await storage.getWeeklyScores(leagueId, week);
        
        for (const member of members) {
          const mockScore = (80 + Math.random() * 100).toFixed(2);
          const hasExisting = existingScores.some(s => s.userId === member.userId);
          
          if (!hasExisting) {
            await storage.addWeeklyScore({
              leagueId,
              userId: member.userId,
              week,
              score: mockScore,
              source: 'mock'
            });
            scoresUpdated++;
          }
        }
      }

      // Get league settings for automated payouts
      const hpsPrize = settings.weeklyHighScorePrize || settings.weeklyPayoutAmount || 0;
      const lpsEnabled = settings.weeklyLowScoreFeeEnabled || settings.lowestScorerFeeEnabled || false;
      const lpsFee = settings.weeklyLowScoreFee || settings.lowestScorerFee || 0;

      let hpsPayoutCreated = false;
      let lpsRequestCreated = false;
      let highScorer: any = null;
      let lowScorer: any = null;

      // Automatically issue HPS (Highest Point Scorer) payout
      if (hpsPrize > 0) {
        highScorer = await storage.getHighestScorerForWeek(leagueId, week);
        if (highScorer) {
          // Create payout to highest scorer's wallet
          const payout = await storage.createPayout({
            leagueId,
            userId: highScorer.userId,
            amount: String(hpsPrize),
            reason: 'weekly_high_score',
            week,
            payoutType: 'standard',
            status: 'approved'
          });

          // Credit to member wallet
          const wallet = await storage.getOrCreateWallet(leagueId, highScorer.userId);
          await storage.creditWallet(
            wallet.id, 
            String(hpsPrize), 
            'payout', 
            payout.id, 
            `Week ${week} High Point Scorer Prize`
          );
          hpsPayoutCreated = true;
        }
      }

      // Create LPS (Lowest Point Scorer) payment request
      let lpsSmsStatus = '';
      if (lpsEnabled && lpsFee > 0) {
        lowScorer = await storage.getLowestScorerForWeek(leagueId, week);
        if (lowScorer) {
          // Generate unique payment token
          const paymentToken = `lps_${leagueId}_${week}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          // Get member phone number
          const member = await storage.getLeagueMember(leagueId, lowScorer.userId);
          
          // Create LPS payment request
          const lpsRequest = await storage.createLpsPaymentRequest({
            leagueId,
            userId: lowScorer.userId,
            week,
            amount: String(lpsFee),
            paymentToken,
            phoneNumber: member?.phoneNumber || null
          });
          lpsRequestCreated = true;
          
          // Send SMS notification via Twilio if configured
          const { sendSMS, isTwilioConfigured } = await import('./twilio');
          if (member?.phoneNumber && await isTwilioConfigured()) {
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
              : 'https://your-app.replit.app';
            const paymentLink = `${baseUrl}/pay-lps/${paymentToken}`;
            const message = `You had the lowest score in "${league.name}" Week ${week}. Pay your $${lpsFee} LPS fee here: ${paymentLink}`;
            
            const smsResult = await sendSMS(member.phoneNumber, message);
            if (smsResult.success) {
              await storage.markLpsSmsAsSent(lpsRequest.id);
              lpsSmsStatus = 'sent';
            } else {
              lpsSmsStatus = 'failed';
            }
          } else {
            lpsSmsStatus = member?.phoneNumber ? 'twilio_not_configured' : 'no_phone';
          }
          
          console.log(`[LPS] Payment request created for user ${lowScorer.userId} - Week ${week} - $${lpsFee} - SMS: ${lpsSmsStatus}`);
        }
      }

      // Update lastScoreSync timestamp
      const currentSettings = league.settings || {};
      await storage.updateLeagueSettings(leagueId, {
        ...currentSettings,
        lastScoreSync: new Date().toISOString()
      });
      
      res.json({ 
        success: true, 
        scoresUpdated,
        source: dataSource,
        espnError: espnError || undefined,
        unmappedMembers: unmappedMembers.length > 0 ? unmappedMembers : undefined,
        automation: {
          hpsPayoutCreated,
          hpsRecipient: highScorer?.userId,
          hpsAmount: hpsPrize,
          lpsRequestCreated,
          lpsRecipient: lowScorer?.userId,
          lpsAmount: lpsFee,
          lpsSmsStatus
        }
      });
    } catch (err) {
      console.error("Error syncing scores:", err);
      res.status(500).json({ message: "Failed to sync scores" });
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

  // === LPS PAYMENT (Public endpoint for lowest scorer fee payment) ===
  app.get("/api/lps-payment/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const lpsRequest = await storage.getLpsPaymentByToken(token);
      
      if (!lpsRequest) {
        return res.status(404).json({ message: "Payment request not found or expired" });
      }
      
      if (lpsRequest.status === 'paid') {
        return res.status(400).json({ message: "This payment has already been completed" });
      }

      // Get league details for display
      const league = await storage.getLeague(lpsRequest.leagueId);
      
      res.json({
        id: lpsRequest.id,
        leagueId: lpsRequest.leagueId,
        leagueName: league?.name || 'Unknown League',
        week: lpsRequest.week,
        amount: lpsRequest.amount,
        status: lpsRequest.status
      });
    } catch (err) {
      console.error("Error fetching LPS payment:", err);
      res.status(500).json({ message: "Failed to fetch payment details" });
    }
  });

  app.post("/api/lps-payment/:token/pay", async (req, res) => {
    try {
      const { token } = req.params;
      const lpsRequest = await storage.getLpsPaymentByToken(token);
      
      if (!lpsRequest) {
        return res.status(404).json({ message: "Payment request not found or expired" });
      }
      
      if (lpsRequest.status === 'paid') {
        return res.status(400).json({ message: "This payment has already been completed" });
      }

      // Create payment record
      const payment = await storage.createPayment({
        leagueId: lpsRequest.leagueId,
        userId: lpsRequest.userId,
        amount: lpsRequest.amount,
        status: 'completed',
        stripePaymentIntentId: null
      });

      // Update LPS request status
      await storage.updateLpsPaymentStatus(lpsRequest.id, 'paid');

      // Add to league treasury
      await storage.updateLeagueTotalDues(lpsRequest.leagueId, Number(lpsRequest.amount));
      
      res.json({ 
        success: true, 
        message: "Payment completed successfully",
        paymentId: payment.id
      });
    } catch (err) {
      console.error("Error processing LPS payment:", err);
      res.status(500).json({ message: "Payment failed" });
    }
  });

  // === PAYOUTS ===
  // Instant payout fee percentage (e.g., 2.5% for instant payouts)
  const INSTANT_PAYOUT_FEE_PERCENT = 2.5;

  app.post(api.payouts.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, userId: recipientId, amount, reason, week, payoutType = 'standard' } = req.body;
      
      // Authorization check (only commissioner)
      const league = await storage.getLeague(Number(leagueId));
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can issue payouts" });
      }

      // Calculate fee for instant payouts
      let feeAmount = "0";
      let netAmount = String(amount);
      
      if (payoutType === 'instant') {
        const fee = (Number(amount) * INSTANT_PAYOUT_FEE_PERCENT / 100);
        feeAmount = fee.toFixed(2);
        netAmount = (Number(amount) - fee).toFixed(2);
      }

      const payout = await storage.createPayout({
        leagueId: Number(leagueId),
        userId: recipientId,
        amount: netAmount,
        reason,
        week: week || null,
        status: payoutType === 'instant' ? 'paid' : 'approved',
        payoutType,
        feeAmount
      });

      // Credit the recipient's wallet
      const recipientWallet = await storage.getOrCreateWallet(Number(leagueId), recipientId);
      await storage.creditWallet(
        recipientWallet.id,
        netAmount,
        'payout',
        payout.id,
        `${reason === 'weekly_high_score' ? 'Weekly High Score' : reason === 'championship' ? 'Championship Prize' : reason === 'refund' ? 'Refund' : 'Payout'} - Week ${week || 'N/A'}`
      );

      // If instant payout with fee, record the platform fee
      if (payoutType === 'instant' && Number(feeAmount) > 0) {
        const platformFee = await storage.createPlatformFee({
          payoutId: payout.id,
          leagueId: Number(leagueId),
          amount: feeAmount,
          feeType: 'instant_payout'
        });

        // In production, this would trigger a Stripe transfer to the business account
        // For now, mark as transferred (simulated)
        await storage.updatePlatformFeeStatus(platformFee.id, 'transferred');
      }
      
      res.status(201).json({ 
        ...payout, 
        feeCharged: feeAmount,
        estimatedArrival: payoutType === 'instant' ? 'Immediate' : '3-5 business days',
        walletCredited: true
      });
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
      const weeklyPrize = league.settings?.weeklyHighScorePrize || league.settings?.weeklyPayoutAmount || 0;
      if (weeklyPrize > 0) {
        const highestScorer = scores[0];
        const payout = await storage.createPayout({
          leagueId,
          userId: highestScorer.userId,
          amount: String(weeklyPrize),
          reason: 'weekly_high_score',
          week: Number(week),
          status: 'approved'
        });
        results.processed.push({ type: 'payout', userId: highestScorer.userId, amount: weeklyPrize });
      }

      // Process lowest scorer penalty if enabled
      const lpsEnabled = league.settings?.weeklyLowScoreFeeEnabled || league.settings?.lowestScorerFeeEnabled || false;
      const lpsFee = league.settings?.weeklyLowScoreFee || league.settings?.lowestScorerFee || 0;
      if (lpsEnabled && lpsFee > 0) {
        const lowestScorer = scores[scores.length - 1];
        const payment = await storage.createPayment({
          leagueId,
          userId: lowestScorer.userId,
          amount: String(lpsFee),
          status: 'pending',
          stripePaymentIntentId: null
        });
        results.processed.push({ type: 'penalty', userId: lowestScorer.userId, amount: lpsFee });
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
      const weeklyLowScoreFeeEnabled = league?.settings?.weeklyLowScoreFeeEnabled || league?.settings?.lowestScorerFeeEnabled || false;
      const weeklyLowScoreFee = league?.settings?.weeklyLowScoreFee || league?.settings?.lowestScorerFee || 0;
      
      res.json({ 
        scores, 
        highestScorer, 
        lowestScorer,
        weeklyLowScoreFeeEnabled,
        weeklyLowScoreFee
      });
    } catch (err) {
      console.error("Error fetching scores:", err);
      res.status(500).json({ message: "Failed to fetch scores" });
    }
  });

  // === WALLETS ===
  // Get user's wallets across all leagues
  app.get(api.wallets.myWallets.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const wallets = await storage.getUserWallets(userId);
      
      // Enrich with league names
      const enrichedWallets = await Promise.all(wallets.map(async (wallet) => {
        const league = await storage.getLeague(wallet.leagueId);
        return {
          ...wallet,
          leagueName: league?.name || 'Unknown League'
        };
      }));
      
      res.json(enrichedWallets);
    } catch (err) {
      console.error("Error fetching user wallets:", err);
      res.status(500).json({ message: "Failed to fetch wallets" });
    }
  });

  // Get user's wallet for a specific league
  app.get(api.wallets.getWallet.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      
      const wallet = await storage.getOrCreateWallet(leagueId, userId);
      const transactions = await storage.getWalletTransactions(wallet.id);
      const league = await storage.getLeague(leagueId);
      
      res.json({
        ...wallet,
        leagueName: league?.name || 'Unknown League',
        transactions
      });
    } catch (err) {
      console.error("Error fetching wallet:", err);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // Get wallet transactions
  app.get(api.wallets.transactions.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const walletId = Number(req.params.id);
      
      const wallet = await storage.getMemberWalletById(walletId);
      if (!wallet || wallet.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const transactions = await storage.getWalletTransactions(walletId);
      res.json(transactions);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Get league treasury (commissioner only)
  app.get(api.wallets.treasury.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Only commissioner can view treasury
      if (league.commissionerId !== userId) {
        const isAdmin = await storage.isUserAdmin(userId);
        if (!isAdmin) {
          return res.status(403).json({ message: "Only commissioner can view treasury" });
        }
      }
      
      const treasury = await storage.getLeagueTreasury(leagueId);
      const memberWallets = await storage.getLeagueWallets(leagueId);
      
      res.json({
        ...treasury,
        memberWallets,
        leagueName: league.name
      });
    } catch (err) {
      console.error("Error fetching treasury:", err);
      res.status(500).json({ message: "Failed to fetch treasury" });
    }
  });

  // Withdraw funds from wallet
  const WITHDRAWAL_INSTANT_FEE_PERCENT = 2.5;
  
  app.post(api.wallets.withdraw.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const walletId = Number(req.params.id);
      const { amount, payoutType = 'standard' } = req.body;
      
      const wallet = await storage.getMemberWalletById(walletId);
      if (!wallet || wallet.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (Number(wallet.availableBalance) < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      
      // Calculate fee for instant withdrawals
      let feeAmount = "0";
      let netAmount = String(amount);
      
      if (payoutType === 'instant') {
        const fee = (Number(amount) * WITHDRAWAL_INSTANT_FEE_PERCENT / 100);
        feeAmount = fee.toFixed(2);
        netAmount = (Number(amount) - Number(feeAmount)).toFixed(2);
      }
      
      // Create withdrawal request
      const withdrawalRequest = await storage.createWithdrawalRequest({
        walletId,
        leagueId: wallet.leagueId,
        userId,
        amount: String(amount),
        payoutType,
        feeAmount,
        netAmount
      });
      
      // Debit wallet
      await storage.debitWallet(
        walletId,
        String(amount),
        'withdrawal',
        withdrawalRequest.id,
        `Withdrawal request - ${payoutType === 'instant' ? 'Instant' : 'Standard'}`
      );
      
      // For instant, auto-complete (simulated). For standard, leave as pending
      if (payoutType === 'instant') {
        await storage.updateWithdrawalStatus(withdrawalRequest.id, 'completed', 'simulated_transfer_' + Date.now());
      } else {
        await storage.updateWithdrawalStatus(withdrawalRequest.id, 'processing');
      }
      
      res.status(201).json({
        ...withdrawalRequest,
        feeAmount,
        netAmount,
        estimatedArrival: payoutType === 'instant' ? 'Immediate' : '3-5 business days'
      });
    } catch (err: any) {
      console.error("Error processing withdrawal:", err);
      res.status(500).json({ message: err.message || "Failed to process withdrawal" });
    }
  });

  // Get user's withdrawal history
  app.get(api.wallets.withdrawals.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const withdrawals = await storage.getUserWithdrawals(userId);
      res.json(withdrawals);
    } catch (err) {
      console.error("Error fetching withdrawals:", err);
      res.status(500).json({ message: "Failed to fetch withdrawals" });
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

  // === ESPN INTEGRATION ===
  // Fetch ESPN teams for mapping
  app.get("/api/leagues/:id/espn-teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can manage ESPN integration" });
      }

      const settings = league.settings || {};
      if (!settings.espnLeagueId) {
        return res.status(400).json({ message: "ESPN League ID not configured" });
      }

      const { fetchEspnTeams } = await import('./espn-api');
      const seasonId = settings.espnSeasonId || new Date().getFullYear().toString();
      const cookies = settings.espnPrivateLeague ? {
        espnS2: settings.espnS2,
        swid: settings.espnSwid
      } : undefined;

      const result = await fetchEspnTeams(settings.espnLeagueId, seasonId, cookies);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ teams: result.teams });
    } catch (err) {
      console.error("Error fetching ESPN teams:", err);
      res.status(500).json({ message: "Failed to fetch ESPN teams" });
    }
  });

  // Update member's ESPN team mapping
  app.patch("/api/leagues/:id/members/:memberId/espn-team", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      const { espnTeamId } = req.body;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can update ESPN mappings" });
      }

      // Verify member belongs to this league
      const member = league.members?.find((m: any) => m.id === memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found in this league" });
      }

      await storage.updateMemberEspnTeamId(memberId, espnTeamId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating ESPN team mapping:", err);
      res.status(500).json({ message: "Failed to update ESPN team mapping" });
    }
  });

  // === PAYMENT REMINDERS ===
  // Update member phone number
  app.patch("/api/leagues/:id/members/:memberId/phone", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      const { phoneNumber } = req.body;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can update member info" });
      }

      // Verify member belongs to this league
      const member = league.members?.find((m: any) => m.id === memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found in this league" });
      }

      await storage.updateMemberPhoneNumber(memberId, phoneNumber);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating phone number:", err);
      res.status(500).json({ message: "Failed to update phone number" });
    }
  });

  // Send payment reminders to all unpaid members
  app.post("/api/leagues/:id/send-reminders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { type } = req.body; // 'pre_season', 'weekly', 'final'

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can send reminders" });
      }

      const unpaidMembers = await storage.getUnpaidMembersWithPhone(leagueId);
      const results: any[] = [];
      const entryFee = league.settings?.entryFee || league.settings?.seasonDues || 0;

      // Import Twilio helper
      const { sendSMS, isTwilioConfigured } = await import('./twilio');
      const twilioReady = await isTwilioConfigured();

      for (const member of unpaidMembers) {
        const reminder = await storage.createPaymentReminder({
          leagueId,
          userId: member.userId,
          type: type || 'weekly',
          phoneNumber: member.phoneNumber || null
        });

        if (member.phoneNumber && twilioReady) {
          // Build reminder message
          let message = '';
          if (type === 'pre_season') {
            message = `Hey! Your fantasy league "${league.name}" is starting soon. Please pay your $${entryFee} entry fee to secure your spot. - LeagueVault`;
          } else if (type === 'final') {
            message = `FINAL NOTICE: Your $${entryFee} dues for "${league.name}" are overdue. Please pay immediately to avoid removal. - LeagueVault`;
          } else {
            message = `Reminder: Your $${entryFee} dues for "${league.name}" are still unpaid. Please pay at your earliest convenience. - LeagueVault`;
          }

          const smsResult = await sendSMS(member.phoneNumber, message);
          
          if (smsResult.success) {
            await storage.updateReminderStatus(reminder.id, 'sent');
            results.push({
              memberId: member.id,
              userId: member.userId,
              phoneNumber: member.phoneNumber,
              status: 'sent',
              messageId: smsResult.messageId
            });
          } else {
            await storage.updateReminderStatus(reminder.id, 'failed');
            results.push({
              memberId: member.id,
              userId: member.userId,
              phoneNumber: member.phoneNumber,
              status: 'failed',
              error: smsResult.error
            });
          }
        } else if (member.phoneNumber && !twilioReady) {
          results.push({
            memberId: member.id,
            userId: member.userId,
            phoneNumber: member.phoneNumber,
            status: 'pending',
            message: 'Twilio not configured - reminder logged'
          });
        } else {
          results.push({
            memberId: member.id,
            userId: member.userId,
            status: 'no_phone',
            message: 'No phone number on file'
          });
        }
      }

      const sentCount = results.filter(r => r.status === 'sent').length;
      res.json({
        success: true,
        remindersCreated: results.length,
        smsSent: sentCount,
        twilioConfigured: twilioReady,
        results
      });
    } catch (err) {
      console.error("Error sending reminders:", err);
      res.status(500).json({ message: "Failed to send reminders" });
    }
  });

  // Update league start date (for pre-season reminders)
  app.patch("/api/leagues/:id/start-date", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { startDate } = req.body;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can update league" });
      }

      await storage.updateLeagueStartDate(leagueId, new Date(startDate));
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating start date:", err);
      res.status(500).json({ message: "Failed to update start date" });
    }
  });

  // Get league reminders history
  app.get("/api/leagues/:id/reminders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can view reminders" });
      }

      const reminders = await storage.getLeagueReminders(leagueId);
      res.json(reminders);
    } catch (err) {
      console.error("Error fetching reminders:", err);
      res.status(500).json({ message: "Failed to fetch reminders" });
    }
  });

  // === LEAGUE MESSAGES (Message Board) ===
  app.get("/api/leagues/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Check if user is a member of the league
      const member = await storage.getLeagueMember(leagueId, userId);
      if (!member && league.commissionerId !== userId) {
        return res.status(403).json({ message: "You must be a member of this league" });
      }

      const messages = await storage.getLeagueMessages(leagueId, 50);
      res.json(messages);
    } catch (err) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/leagues/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { content } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Message content is required" });
      }

      if (content.length > 1000) {
        return res.status(400).json({ message: "Message is too long (max 1000 characters)" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Check if user is a member of the league
      const member = await storage.getLeagueMember(leagueId, userId);
      if (!member && league.commissionerId !== userId) {
        return res.status(403).json({ message: "You must be a member of this league to post messages" });
      }

      const message = await storage.createLeagueMessage(leagueId, userId, content.trim());
      res.status(201).json(message);
    } catch (err) {
      console.error("Error posting message:", err);
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  app.delete("/api/leagues/:id/messages/:messageId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const messageId = Number(req.params.messageId);

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const message = await storage.getLeagueMessage(messageId);
      if (!message || message.leagueId !== leagueId) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Only the author or commissioner can delete
      if (message.userId !== userId && league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only delete your own messages" });
      }

      await storage.deleteLeagueMessage(messageId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting message:", err);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  return httpServer;
}
