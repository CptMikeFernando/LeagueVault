import type { Express } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import { sendSMS } from "./twilio";

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
  
  // Preview ESPN league data without creating (for team selection)
  app.post("/api/leagues/preview-espn", isAuthenticated, async (req: any, res) => {
    try {
      const { leagueUrl, espnS2, swid } = req.body;
      
      const urlMatch = leagueUrl.match(/leagueId=(\d+)/);
      if (!urlMatch) {
        return res.status(400).json({ message: "Could not parse ESPN league ID from URL." });
      }
      const espnLeagueId = urlMatch[1];
      
      const now = new Date();
      const currentYear = now.getMonth() < 7 
        ? (now.getFullYear() - 1).toString() 
        : now.getFullYear().toString();
      
      const { fetchEspnLeagueInfo } = await import('./espn-api');
      const cookies = espnS2 && swid ? { espnS2, swid } : undefined;
      const result = await fetchEspnLeagueInfo(espnLeagueId, currentYear, cookies);
      
      if (!result.success || !result.data) {
        return res.status(400).json({ 
          message: result.error || "Failed to fetch ESPN league data." 
        });
      }
      
      return res.json({
        success: true,
        leagueName: result.data.name,
        seasonId: result.data.seasonId,
        teams: result.data.teams.map(t => ({
          id: t.id,
          name: t.name,
          ownerName: t.ownerName
        }))
      });
    } catch (err) {
      console.error("Error previewing ESPN league:", err);
      res.status(500).json({ message: "Failed to preview ESPN league" });
    }
  });
  
  app.post(api.leagues.syncPlatform.path, isAuthenticated, async (req: any, res) => {
    try {
      const { platform, leagueUrl, espnS2, swid, selectedTeamId } = req.body;
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
        
        console.log(`ESPN Import: League ID ${espnLeagueId}, Season ${currentYear}, Cookies provided: ${!!(espnS2 && swid)}, Selected Team: ${selectedTeamId}`);
        
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

        // Create members for each ESPN team
        // The user's selected team uses their real user ID, others are placeholders
        let commissionerAssigned = false;
        
        for (const team of espnData.teams) {
          try {
            // Check if this is the user's selected team
            const isCommissionerTeam = selectedTeamId ? 
              team.id.toString() === selectedTeamId.toString() : 
              false;
            
            await storage.addLeagueMember({
              leagueId: league.id,
              userId: isCommissionerTeam ? userId : `espn-team-${league.id}-${team.id}`,
              role: isCommissionerTeam ? 'commissioner' : 'member',
              teamName: team.name,
              ownerName: team.ownerName || null,
              externalTeamId: team.id.toString(),
              paidStatus: 'unpaid'
            });
            
            if (isCommissionerTeam) {
              commissionerAssigned = true;
            }
          } catch (err) {
            // Skip if there's a constraint violation (shouldn't happen with unique IDs)
            console.warn(`Could not add placeholder for team ${team.id}:`, err);
          }
        }
        
        // If no team was selected or found, add commissioner as a basic member
        if (!commissionerAssigned) {
          await storage.addLeagueMember({
            leagueId: league.id,
            userId,
            role: 'commissioner',
            teamName: 'Commissioner',
            paidStatus: 'unpaid'
          });
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

  // === MEMBER DUES PAYMENT (Public endpoint for payment token) ===
  app.get("/api/pay-dues/:token", async (req: any, res) => {
    try {
      const { token } = req.params;
      const member = await storage.getMemberByPaymentToken(token);
      
      if (!member) {
        return res.status(404).json({ message: "Payment link not found or expired" });
      }
      
      // Check if token has expired
      if (member.paymentTokenExpiresAt && new Date(member.paymentTokenExpiresAt) < new Date()) {
        return res.status(400).json({ message: "This payment link has expired" });
      }
      
      // Check if already paid
      if (member.paidStatus === 'paid') {
        const league = await storage.getLeague(member.leagueId);
        return res.json({
          alreadyPaid: true,
          leagueName: league?.name || 'Unknown League'
        });
      }

      const league = await storage.getLeague(member.leagueId);
      
      // Check if the current user (if logged in) is linked to this member
      const currentUserId = req.user?.claims?.sub;
      const isLinked = currentUserId && member.userId === currentUserId;
      
      res.json({
        memberId: member.id,
        leagueId: member.leagueId,
        leagueName: league?.name || 'Unknown League',
        amount: league?.entryFee || '0',
        teamName: member.teamName,
        ownerName: member.ownerName,
        isLinked: isLinked,
        alreadyPaid: false
      });
    } catch (err) {
      console.error("Error fetching dues payment:", err);
      res.status(500).json({ message: "Failed to fetch payment details" });
    }
  });

  app.post("/api/pay-dues/:token/link-account", isAuthenticated, async (req: any, res) => {
    try {
      const { token } = req.params;
      const userId = req.user.claims.sub;
      
      const member = await storage.getMemberByPaymentToken(token);
      
      if (!member) {
        return res.status(404).json({ message: "Payment link not found" });
      }
      
      // Check if token has expired
      if (member.paymentTokenExpiresAt && new Date(member.paymentTokenExpiresAt) < new Date()) {
        return res.status(400).json({ message: "This payment link has expired" });
      }
      
      // Security check: Only allow linking if member is unclaimed (placeholder ID) or already belongs to this user
      const isPlaceholder = member.userId?.startsWith('espn-team-') || member.userId?.startsWith('yahoo-team-');
      const isAlreadyLinked = member.userId === userId;
      
      if (!isPlaceholder && !isAlreadyLinked) {
        return res.status(403).json({ message: "This team membership is already linked to another account" });
      }
      
      // Link the member to this user's account
      await storage.linkMemberToUser(member.id, userId);
      
      // Clear the payment token after successful linking to prevent reuse
      await storage.setMemberPaymentToken(member.id, '');
      
      res.json({ success: true, message: "Account linked successfully" });
    } catch (err) {
      console.error("Error linking account:", err);
      res.status(500).json({ message: "Failed to link account" });
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

      // Get league settings to check if lowest scorer fee is enabled and get prize amounts
      const league = await storage.getLeague(leagueId);
      const weeklyLowScoreFeeEnabled = league?.settings?.weeklyLowScoreFeeEnabled || league?.settings?.lowestScorerFeeEnabled || false;
      const weeklyLowScoreFee = league?.settings?.weeklyLowScoreFee || league?.settings?.lowestScorerFee || 0;
      const weeklyHighScorePrize = league?.settings?.weeklyHighScorePrize || league?.settings?.weeklyPayoutAmount || 0;
      
      res.json({ 
        scores, 
        highestScorer, 
        lowestScorer,
        weeklyLowScoreFeeEnabled,
        weeklyLowScoreFee,
        weeklyHighScorePrize
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
      
      // Enrich wallets with member names
      const enrichedWallets = memberWallets.map(wallet => {
        const member = league.members?.find((m: any) => m.userId === wallet.userId);
        return {
          ...wallet,
          memberName: member?.ownerName || member?.teamName || `User ${wallet.userId.slice(0, 8)}`,
          teamName: member?.teamName || null
        };
      });
      
      res.json({
        ...treasury,
        memberWallets: enrichedWallets,
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

  // === TWILIO TEST ===
  app.post("/api/test-twilio", isAuthenticated, async (req: any, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      const { sendSMS, isTwilioConfigured, getTwilioFromPhoneNumber } = await import('./twilio');
      const configured = await isTwilioConfigured();
      console.log('Twilio test - configured:', configured);
      
      if (!configured) {
        return res.status(500).json({ message: "Twilio is not configured", configured: false });
      }
      
      const fromNumber = await getTwilioFromPhoneNumber();
      console.log('Twilio test - from number:', fromNumber);
      
      const result = await sendSMS(phoneNumber, "Test message from LeagueVault - SMS is working!");
      console.log('Twilio test - result:', result);
      
      res.json({ 
        configured,
        fromNumber,
        result 
      });
    } catch (err: any) {
      console.error("Twilio test error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
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
        payment_method_types: ['card', 'us_bank_account'],
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

  // === STRIPE CONNECT (for receiving payouts) ===
  
  // Get user's Stripe Connect status
  app.get("/api/stripe/connect/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        hasConnectAccount: !!user.stripeConnectAccountId,
        isOnboarded: !!user.stripeConnectOnboarded,
        accountId: user.stripeConnectAccountId || null
      });
    } catch (err) {
      console.error("Error getting Connect status:", err);
      res.status(500).json({ message: "Failed to get Connect status" });
    }
  });

  // Create Stripe Connect account and get onboarding link
  app.post("/api/stripe/connect/onboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const stripe = await getUncachableStripeClient();
      let accountId = user.stripeConnectAccountId;

      // Create Connect account if doesn't exist
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email || undefined,
          metadata: {
            userId: userId
          },
          capabilities: {
            transfers: { requested: true },
          },
        });
        accountId = account.id;
        
        // Save the account ID
        await storage.updateUserStripeConnect(userId, accountId);
      }

      // Create account onboarding link
      const baseUrl = req.headers.origin || `https://${req.get('host')}`;
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/wallet?connect=refresh`,
        return_url: `${baseUrl}/wallet?connect=success`,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url });
    } catch (err) {
      console.error("Error creating Connect onboarding:", err);
      res.status(500).json({ message: "Failed to start onboarding" });
    }
  });

  // Check if Connect onboarding is complete
  app.post("/api/stripe/connect/verify", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeConnectAccountId) {
        return res.json({ verified: false, message: "No Connect account" });
      }

      const stripe = await getUncachableStripeClient();
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);

      // Check if onboarding is complete
      if (account.details_submitted && account.payouts_enabled) {
        await storage.updateUserStripeConnectOnboarded(userId);
        return res.json({ verified: true });
      }

      res.json({ 
        verified: false, 
        detailsSubmitted: account.details_submitted,
        payoutsEnabled: account.payouts_enabled
      });
    } catch (err) {
      console.error("Error verifying Connect account:", err);
      res.status(500).json({ message: "Failed to verify account" });
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

  // === LEAGUE INVITES ===
  app.post("/api/leagues/:id/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { contactType, contactValue, teamName, ownerName } = req.body;

      if (!contactType || !contactValue) {
        return res.status(400).json({ message: "Contact type and value are required" });
      }

      if (contactType !== 'phone' && contactType !== 'email') {
        return res.status(400).json({ message: "Contact type must be 'phone' or 'email'" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can invite members" });
      }

      const inviteToken = crypto.randomUUID();
      const invite = await storage.createLeagueInvite({
        leagueId,
        invitedBy: userId,
        contactType,
        contactValue,
        inviteToken,
        teamName: teamName || null,
        ownerName: ownerName || null
      });

      // Create a placeholder league member immediately with contact info
      const placeholderUserId = `invite_${invite.id}`;
      await storage.addLeagueMember({
        leagueId,
        userId: placeholderUserId,
        role: 'member',
        teamName: teamName || 'Pending Team',
        ownerName: ownerName || 'Pending Member',
        phoneNumber: contactType === 'phone' ? contactValue : null,
        email: contactType === 'email' ? contactValue : null,
        paidStatus: 'unpaid'
      });

      let inviteSent = false;
      let inviteMethod = '';
      
      console.log('=== INVITE DEBUG START ===');
      console.log('Contact type:', contactType);
      console.log('Contact value:', contactValue);
      
      if (contactType === 'phone') {
        console.log('Attempting to send SMS invite...');
        const { sendSMS, isTwilioConfigured, getTwilioFromPhoneNumber } = await import('./twilio');
        
        try {
          const twilioReady = await isTwilioConfigured();
          console.log('Twilio configured:', twilioReady);
          
          if (twilioReady) {
            const fromNumber = await getTwilioFromPhoneNumber();
            console.log('Twilio from number:', fromNumber);
            
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
              : 'https://your-app.replit.app';
            const leagueUrl = `${baseUrl}/leagues/${leagueId}`;
            const message = `You've been invited to pay your dues for ${league.name} on LeagueVault! Click here to pay your dues now.\n\n${leagueUrl}`;
            
            console.log('Sending invite SMS to:', contactValue);
            console.log('Message:', message);
            const smsResult = await sendSMS(contactValue, message);
            console.log('SMS result:', JSON.stringify(smsResult));
            
            if (smsResult.success) {
              await storage.updateInviteStatus(invite.id, 'sent');
              inviteSent = true;
              inviteMethod = 'sms';
              console.log('Invite status updated to sent');
            } else {
              console.error('Failed to send invite SMS:', smsResult.error);
            }
          } else {
            console.warn('Twilio not configured - invite SMS not sent');
          }
        } catch (smsError: any) {
          console.error('SMS sending error:', smsError.message, smsError.stack);
        }
      } else if (contactType === 'email') {
        // Email sending not configured - would require SendGrid/Resend setup
        console.log('Email invite requested - email service not configured');
        // Member is created but email not sent - show appropriate message
      }
      
      console.log('=== INVITE DEBUG END ===');
      res.status(201).json({ 
        ...invite, 
        inviteSent, 
        inviteMethod,
        emailNotConfigured: contactType === 'email'
      });
    } catch (err) {
      console.error("Error creating invite:", err);
      res.status(500).json({ message: "Failed to send invite" });
    }
  });

  app.get("/api/leagues/:id/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      
      // Authorization: Only commissioner can view invites
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can view invites" });
      }
      
      const invites = await storage.getLeagueInvites(leagueId);
      res.json(invites);
    } catch (err) {
      console.error("Error fetching invites:", err);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // Cancel a pending invite
  app.delete("/api/leagues/:id/invites/:inviteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can cancel invites" });
      }
      
      await storage.updateInviteStatus(inviteId, 'cancelled');
      res.json({ success: true, message: "Invite cancelled" });
    } catch (err) {
      console.error("Error cancelling invite:", err);
      res.status(500).json({ message: "Failed to cancel invite" });
    }
  });

  // === UPDATE MEMBER DETAILS ===
  const updateMemberSchema = z.object({
    teamName: z.string().max(100).nullable().optional(),
    ownerName: z.string().max(100).nullable().optional(),
    phoneNumber: z.string().max(20).nullable().optional(),
    email: z.string().email().max(255).nullable().optional().or(z.literal('').transform(() => null))
  });

  app.patch("/api/leagues/:id/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      
      const parseResult = updateMemberSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parseResult.error.flatten() });
      }
      const { teamName, ownerName, phoneNumber, email } = parseResult.data;

      // Verify league exists and user is commissioner
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can update member details" });
      }

      // Fetch fresh member data directly from database
      const member = await storage.getLeagueMemberById(memberId);
      if (!member || member.leagueId !== leagueId) {
        return res.status(404).json({ message: "Member not found in this league" });
      }

      // Build update object - merge with current DB values for fields not provided
      const updates = {
        teamName: teamName !== undefined ? (teamName || null) : member.teamName,
        ownerName: ownerName !== undefined ? (ownerName || null) : member.ownerName,
        phoneNumber: phoneNumber !== undefined ? (phoneNumber || null) : member.phoneNumber,
        email: email !== undefined ? (email || null) : member.email
      };

      const updatedMember = await storage.updateMemberDetails(memberId, updates);
      res.json(updatedMember);
    } catch (err) {
      console.error("Error updating member:", err);
      res.status(500).json({ message: "Failed to update member" });
    }
  });

  // === DELETE LEAGUE MEMBER ===
  app.delete("/api/leagues/:id/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const memberId = Number(req.params.memberId);

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can remove members" });
      }

      const member = await storage.getLeagueMemberById(memberId);
      if (!member || member.leagueId !== leagueId) {
        return res.status(404).json({ message: "Member not found in this league" });
      }

      // Prevent commissioner from deleting themselves
      if (member.userId === userId) {
        return res.status(400).json({ message: "Cannot remove yourself from the league. Transfer commissioner role first." });
      }

      await storage.deleteLeagueMember(memberId);
      res.json({ success: true, message: "Member removed from league" });
    } catch (err) {
      console.error("Error deleting member:", err);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // === RESEND INVITE TO MEMBER ===
  app.post("/api/leagues/:id/members/:memberId/resend-invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      const { method } = req.body;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can resend invites" });
      }

      const member = await storage.getLeagueMemberById(memberId);
      if (!member || member.leagueId !== leagueId) {
        return res.status(404).json({ message: "Member not found in this league" });
      }

      const paymentUrl = `${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'http://localhost:5000'}/pay/${leagueId}`;
      const inviteMessage = `You've been invited to pay your dues for ${league.name} on LeagueVault! Click here to pay your dues now.\n\n${paymentUrl}`;

      if (method === 'sms') {
        if (!member.phoneNumber) {
          return res.status(400).json({ message: "Member has no phone number" });
        }
        const { sendSMS } = await import('./twilio');
        const result = await sendSMS(member.phoneNumber, inviteMessage);
        if (result.success) {
          return res.json({ success: true, method: 'sms', message: `Invite sent via SMS to ${member.phoneNumber}` });
        } else {
          return res.status(500).json({ message: "Failed to send SMS" });
        }
      } else if (method === 'email') {
        if (!member.email) {
          return res.status(400).json({ message: "Member has no email" });
        }
        const { sendInviteEmail } = await import('./sendgrid');
        const result = await sendInviteEmail(member.email, league.name, paymentUrl);
        if (result.success) {
          return res.json({ success: true, method: 'email', message: `Invite sent via email to ${member.email}` });
        } else {
          return res.status(500).json({ message: result.error || "Failed to send email" });
        }
      }

      return res.status(400).json({ message: "Invalid method. Use 'sms' or 'email'" });
    } catch (err) {
      console.error("Error resending invite:", err);
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  // === UPDATE LEAGUE NAME ===
  const updateLeagueNameSchema = z.object({
    name: z.string().min(1, "League name is required").max(100, "League name too long")
  });

  app.patch("/api/leagues/:id/name", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);

      const parseResult = updateLeagueNameSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parseResult.error.flatten() });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can update league name" });
      }

      await storage.updateLeagueName(leagueId, parseResult.data.name);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating league name:", err);
      res.status(500).json({ message: "Failed to update league name" });
    }
  });

  // === TRANSFER COMMISSIONER ===
  app.post("/api/leagues/:id/transfer-commissioner", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const { newCommissionerId } = req.body;

      // Authorization: Only current commissioner can transfer
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the current commissioner can transfer this role" });
      }

      // Validate new commissioner is a member
      const member = await storage.getLeagueMember(leagueId, newCommissionerId);
      if (!member) {
        return res.status(400).json({ message: "Selected user is not a member of this league" });
      }

      await storage.transferCommissioner(leagueId, newCommissionerId);
      res.json({ success: true, message: "Commissioner role transferred successfully" });
    } catch (err) {
      console.error("Error transferring commissioner:", err);
      res.status(500).json({ message: "Failed to transfer commissioner role" });
    }
  });

  // === REQUEST ALL PAYMENTS ===
  app.post("/api/leagues/:id/request-all-payments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can request payments" });
      }

      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'https://your-app.replit.app';

      let sentCount = 0;
      let skippedCount = 0;

      const { sendSMS, isTwilioConfigured } = await import('./twilio');
      const { sendReminderEmail } = await import('./sendgrid');
      const crypto = await import('crypto');
      const twilioReady = await isTwilioConfigured();

      for (const member of league.members || []) {
        // Skip already paid members
        if (member.paidStatus === 'paid') continue;

        const hasPhone = !!member.phoneNumber;
        const hasEmail = !!member.email;

        if (!hasPhone && !hasEmail) {
          skippedCount++;
          continue;
        }

        // Generate a unique payment token for this member
        const paymentToken = crypto.randomBytes(32).toString('hex');
        await storage.setMemberPaymentToken(member.id, paymentToken);
        const paymentUrl = `${baseUrl}/pay-dues/${paymentToken}`;

        let sent = false;

        // Try SMS first if available
        if (hasPhone && twilioReady) {
          const message = `Hey, nerd. You still haven't paid your dues for ${league.name}. Pay up or shut up.\n\nPay here: ${paymentUrl}`;
          const smsResult = await sendSMS(member.phoneNumber, message);
          if (smsResult.success) {
            sent = true;
          }
        }

        // Try email if SMS wasn't sent or failed
        if (!sent && hasEmail) {
          const result = await sendReminderEmail(member.email, league.name, paymentUrl);
          if (result.success) {
            sent = true;
          }
        }

        if (sent) {
          // Mark that payment request was sent (don't change paidStatus)
          await storage.updateMemberPaymentRequestSent(member.id, true);
          sentCount++;
        } else {
          skippedCount++;
        }
      }

      res.json({ success: true, sentCount, skippedCount });
    } catch (err) {
      console.error("Error requesting all payments:", err);
      res.status(500).json({ message: "Failed to request payments" });
    }
  });

  // === INDIVIDUAL PAYMENT REMINDER ===
  app.post("/api/leagues/:id/members/:memberId/remind", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      const { method } = req.body; // 'sms' or 'email'

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioners can send reminders" });
      }

      const member = league.members?.find((m: any) => m.id === memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      if (member.paidStatus === 'paid') {
        return res.status(400).json({ message: "Member has already paid" });
      }

      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'https://your-app.replit.app';
      
      // Generate a unique payment token for this member
      const crypto = await import('crypto');
      const paymentToken = crypto.randomBytes(32).toString('hex');
      await storage.setMemberPaymentToken(memberId, paymentToken);
      const paymentUrl = `${baseUrl}/pay-dues/${paymentToken}`;

      if (method === 'email') {
        if (!member.email) {
          return res.status(400).json({ message: "Member does not have an email address" });
        }
        const { sendReminderEmail } = await import('./sendgrid');
        const result = await sendReminderEmail(member.email, league.name, paymentUrl);
        if (result.success) {
          await storage.createPaymentReminder({
            leagueId,
            userId: member.userId,
            type: 'individual',
            email: member.email
          });
          // Mark payment request as sent
          await storage.updateMemberPaymentRequestSent(memberId, true);
          return res.json({ success: true, messageId: result.messageId, method: 'email' });
        } else {
          return res.status(500).json({ message: result.error || "Failed to send email" });
        }
      } else {
        // Default to SMS
        if (!member.phoneNumber) {
          return res.status(400).json({ message: "Member does not have a phone number" });
        }

        const { sendSMS, isTwilioConfigured } = await import('./twilio');
        if (!await isTwilioConfigured()) {
          return res.status(400).json({ message: "SMS not configured" });
        }

        const message = `Hey, nerd. You still haven't paid your dues for ${league.name}. Pay up or shut up.\n\nPay here: ${paymentUrl}`;
        
        const smsResult = await sendSMS(member.phoneNumber, message);
        
        if (smsResult.success) {
          await storage.createPaymentReminder({
            leagueId,
            userId: member.userId,
            type: 'individual',
            phoneNumber: member.phoneNumber
          });
          // Mark payment request as sent
          await storage.updateMemberPaymentRequestSent(memberId, true);
          res.json({ success: true, messageId: smsResult.messageId, method: 'sms' });
        } else {
          res.status(500).json({ message: smsResult.error || "Failed to send SMS" });
        }
      }
    } catch (err) {
      console.error("Error sending reminder:", err);
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  // === SPORTS SCORES (ESPN unofficial API) ===
  app.get("/api/sports/scores", async (req, res) => {
    try {
      const sport = req.query.sport as string || 'nfl';
      
      let url: string;
      if (sport === 'cfb') {
        url = 'http://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50';
      } else {
        url = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`ESPN API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      const games = (data.events || []).map((event: any) => {
        const competition = event.competitions?.[0];
        const competitors = competition?.competitors || [];
        const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
        const awayTeam = competitors.find((c: any) => c.homeAway === 'away');
        
        return {
          id: event.id,
          name: event.name,
          shortName: event.shortName,
          date: event.date,
          status: {
            type: competition?.status?.type?.name,
            displayClock: competition?.status?.displayClock,
            period: competition?.status?.period
          },
          homeTeam: homeTeam ? {
            id: homeTeam.team?.id,
            name: homeTeam.team?.displayName,
            abbreviation: homeTeam.team?.abbreviation,
            logo: homeTeam.team?.logo,
            score: homeTeam.score,
            winner: homeTeam.winner
          } : null,
          awayTeam: awayTeam ? {
            id: awayTeam.team?.id,
            name: awayTeam.team?.displayName,
            abbreviation: awayTeam.team?.abbreviation,
            logo: awayTeam.team?.logo,
            score: awayTeam.score,
            winner: awayTeam.winner
          } : null
        };
      });
      
      res.json({ 
        sport,
        week: data.week?.number,
        season: data.season?.year,
        games 
      });
    } catch (err) {
      console.error("Error fetching sports scores:", err);
      res.status(500).json({ message: "Failed to fetch scores", games: [] });
    }
  });

  // === WEEKLY AWARDS AUTOMATION ===
  // This endpoint processes HPS wallet credits and LPS SMS notifications
  // Should be triggered every Tuesday after fantasy week ends
  // Requires admin authentication
  app.post("/api/automation/process-weekly-awards", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { leagueId, week } = req.body;
      
      if (!leagueId || !week) {
        return res.status(400).json({ message: "leagueId and week are required" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Check if this week has already been processed
      const existingEvent = await storage.getWeeklyAwardEvent(leagueId, week);
      if (existingEvent?.hpsWalletCredited && existingEvent?.lpsSmssSent) {
        return res.json({ 
          message: "Week already processed",
          event: existingEvent
        });
      }

      // Get highest and lowest scorers for this week using dedicated methods
      const highestScorer = await storage.getHighestScorerForWeek(leagueId, week);
      const lowestScorer = await storage.getLowestScorerForWeek(leagueId, week);
      
      if (!highestScorer || !lowestScorer) {
        return res.status(400).json({ message: "No scores found for this week" });
      }

      const weeklyHighScorePrize = league.settings?.weeklyHighScorePrize || league.settings?.weeklyPayoutAmount || 0;
      const weeklyLowScoreFee = league.settings?.weeklyLowScoreFee || league.settings?.lowestScorerFee || 0;
      const weeklyLowScoreFeeEnabled = league.settings?.weeklyLowScoreFeeEnabled || league.settings?.lowestScorerFeeEnabled || false;

      let hpsWalletCredited = existingEvent?.hpsWalletCredited || false;
      let lpsSmssSent = existingEvent?.lpsSmssSent || false;
      let eventId = existingEvent?.id;

      // Create or update event record
      if (!existingEvent) {
        const event = await storage.createWeeklyAwardEvent({
          leagueId,
          week,
          highScoreUserId: highestScorer?.userId,
          lowScoreUserId: lowestScorer?.userId,
          highScorePrize: String(weeklyHighScorePrize),
          lowScoreFee: String(weeklyLowScoreFee),
          hpsWalletCredited: false,
          lpsSmssSent: false,
        });
        eventId = event.id;
      }

      // Process HPS wallet credit
      if (!hpsWalletCredited && weeklyHighScorePrize > 0 && highestScorer) {
        try {
          const wallet = await storage.getOrCreateWallet(leagueId, highestScorer.userId);
          await storage.creditWallet(
            wallet.id,
            String(weeklyHighScorePrize),
            "payout",
            null,
            `Week ${week} High Score Bonus`
          );
          hpsWalletCredited = true;
          console.log(`Credited $${weeklyHighScorePrize} to ${highestScorer.userId} wallet for Week ${week} HPS`);
        } catch (err) {
          console.error("Failed to credit HPS wallet:", err);
        }
      }

      // Process LPS SMS notification
      if (!lpsSmssSent && weeklyLowScoreFeeEnabled && weeklyLowScoreFee > 0 && lowestScorer) {
        try {
          // Find the member to get their phone number
          const lowestMember = league.members.find(m => m.userId === lowestScorer.userId);
          
          if (lowestMember?.phoneNumber) {
            // Create an LPS payment request
            const paymentToken = crypto.randomUUID();
            await storage.createLpsPaymentRequest({
              leagueId,
              userId: lowestScorer.userId,
              week,
              amount: String(weeklyLowScoreFee),
              paymentToken,
              phoneNumber: lowestMember.phoneNumber,
            });

            // Send SMS notification
            const paymentUrl = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ''}/pay-lps/${paymentToken}`;
            await sendSMS(
              lowestMember.phoneNumber,
              `You had the lowest score in ${league.name} for Week ${week}! You owe $${weeklyLowScoreFee}. Pay now: ${paymentUrl}`
            );
            
            lpsSmssSent = true;
            console.log(`Sent LPS SMS to ${lowestMember.phoneNumber} for Week ${week}`);
          } else {
            console.log(`No phone number for lowest scorer ${lowestScorer.userId} - will retry when contact info is added`);
            // Don't mark as sent - allow retry when phone number is added
          }
        } catch (err) {
          console.error("Failed to send LPS SMS:", err);
        }
      }

      // Update event record
      if (eventId) {
        await storage.updateWeeklyAwardEvent(eventId, { hpsWalletCredited, lpsSmssSent });
      }

      res.json({
        message: "Weekly awards processed",
        week,
        leagueId,
        hpsWalletCredited,
        lpsSmssSent,
        highestScorer: highestScorer?.userId,
        lowestScorer: lowestScorer?.userId,
        weeklyHighScorePrize,
        weeklyLowScoreFee
      });
    } catch (err) {
      console.error("Error processing weekly awards:", err);
      res.status(500).json({ message: "Failed to process weekly awards" });
    }
  });

  return httpServer;
}
