import { db } from "./db";
import { 
  users, leagues, leagueMembers, payments, payouts, weeklyScores, platformFees,
  memberWallets, walletTransactions, withdrawalRequests, lpsPaymentRequests, paymentReminders, leagueMessages, leagueInvites, weeklyAwardEvents,
  type User,
  type League, type InsertLeague,
  type LeagueMember, type InsertLeagueMember,
  type Payment, type InsertPayment,
  type Payout, type InsertPayout,
  type WeeklyScore, type InsertWeeklyScore,
  type PlatformFee, type InsertPlatformFee,
  type MemberWallet, type InsertMemberWallet,
  type WalletTransaction, type InsertWalletTransaction,
  type WithdrawalRequest, type InsertWithdrawalRequest,
  type LpsPaymentRequest, type InsertLpsPaymentRequest,
  type PaymentReminder, type InsertPaymentReminder,
  type LeagueMessage,
  type LeagueInvite,
  type LeagueWithMembers,
  type WeeklyAwardEvent, type InsertWeeklyAwardEvent
} from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  updateUserRole(id: string, role: string): Promise<void>;
  updateUserStripeConnect(id: string, accountId: string): Promise<void>;
  updateUserStripeConnectOnboarded(id: string): Promise<void>;
  isUserAdmin(id: string): Promise<boolean>;

  // Admin methods
  getAllLeagues(): Promise<League[]>;
  getPlatformStats(): Promise<{
    totalLeagues: number;
    totalUsers: number;
    totalPayments: number;
    totalPayouts: number;
    totalFundsCollected: string;
    totalFundsPaidOut: string;
  }>;

  createLeague(league: InsertLeague): Promise<League>;
  getLeague(id: number): Promise<LeagueWithMembers | undefined>;
  getUserLeagues(userId: string): Promise<League[]>;
  updateLeagueTotalDues(id: number, amount: number): Promise<void>;
  updateLeagueSettings(id: number, settings: any): Promise<void>;
  updateLeagueName(id: number, name: string): Promise<void>;

  addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember>;
  getLeagueMember(leagueId: number, userId: string): Promise<LeagueMember | undefined>;
  getLeagueMemberById(id: number): Promise<LeagueMember | undefined>;
  updateMemberStatus(id: number, status: string): Promise<void>;
  updateMemberDetails(id: number, details: { teamName?: string | null; ownerName?: string | null; phoneNumber?: string | null; email?: string | null }): Promise<LeagueMember>;
  deleteLeagueMember(id: number): Promise<void>;

  createPayment(payment: InsertPayment & { userId: string; status: string; stripePaymentIntentId?: string | null }): Promise<Payment>;
  createPayout(payout: InsertPayout & { status: string }): Promise<Payout>;
  getLeagueTransactions(leagueId: number): Promise<{ payments: Payment[], payouts: Payout[] }>;
  
  addWeeklyScore(score: InsertWeeklyScore): Promise<WeeklyScore>;
  updateWeeklyScore(id: number, score: string): Promise<void>;
  getWeeklyScores(leagueId: number, week: number): Promise<WeeklyScore[]>;
  getHighestScorerForWeek(leagueId: number, week: number): Promise<WeeklyScore | undefined>;
  getLowestScorerForWeek(leagueId: number, week: number): Promise<WeeklyScore | undefined>;

  // Platform fees
  createPlatformFee(fee: InsertPlatformFee): Promise<PlatformFee>;
  updatePlatformFeeStatus(id: number, status: string, stripeTransferId?: string): Promise<void>;
  getTotalPlatformFees(): Promise<string>;

  // Member wallets
  getOrCreateWallet(leagueId: number, userId: string): Promise<MemberWallet>;
  getMemberWallet(leagueId: number, userId: string): Promise<MemberWallet | undefined>;
  getMemberWalletById(walletId: number): Promise<MemberWallet | undefined>;
  getUserWallets(userId: string): Promise<MemberWallet[]>;
  getLeagueWallets(leagueId: number): Promise<MemberWallet[]>;
  creditWallet(walletId: number, amount: string, sourceType: string, sourceId: number | null, description: string): Promise<WalletTransaction>;
  debitWallet(walletId: number, amount: string, sourceType: string, sourceId: number | null, description: string): Promise<WalletTransaction>;
  getWalletTransactions(walletId: number): Promise<WalletTransaction[]>;
  getLeagueTreasury(leagueId: number): Promise<{ totalInflow: string; totalOutflow: string; availableBalance: string }>;

  // Withdrawal requests
  createWithdrawalRequest(request: InsertWithdrawalRequest): Promise<WithdrawalRequest>;
  getWithdrawalRequest(id: number): Promise<WithdrawalRequest | undefined>;
  getUserWithdrawals(userId: string): Promise<WithdrawalRequest[]>;
  updateWithdrawalStatus(id: number, status: string, stripeTransferId?: string, failureReason?: string): Promise<void>;

  // LPS Payment Requests
  createLpsPaymentRequest(request: InsertLpsPaymentRequest): Promise<LpsPaymentRequest>;
  getLpsPaymentByToken(token: string): Promise<LpsPaymentRequest | undefined>;
  updateLpsPaymentStatus(id: number, status: string): Promise<void>;
  markLpsSmsAsSent(id: number): Promise<void>;

  // Member phone number
  updateMemberPhoneNumber(memberId: number, phoneNumber: string): Promise<void>;
  updateMemberEspnTeamId(memberId: number, espnTeamId: string): Promise<void>;
  getUnpaidMembersWithPhone(leagueId: number): Promise<LeagueMember[]>;

  // Payment reminders
  createPaymentReminder(reminder: InsertPaymentReminder): Promise<PaymentReminder>;
  updateReminderStatus(id: number, status: string): Promise<void>;
  getLeagueReminders(leagueId: number): Promise<PaymentReminder[]>;

  // League start date
  updateLeagueStartDate(leagueId: number, startDate: Date): Promise<void>;

  // Delete league (commissioner only)
  deleteLeague(leagueId: number): Promise<void>;

  // League messages (message board)
  createLeagueMessage(leagueId: number, userId: string, content: string): Promise<LeagueMessage>;
  getLeagueMessages(leagueId: number, limit?: number): Promise<(LeagueMessage & { user?: User })[]>;
  getLeagueMessage(messageId: number): Promise<LeagueMessage | undefined>;
  deleteLeagueMessage(messageId: number): Promise<void>;

  // League invites
  createLeagueInvite(invite: { leagueId: number; invitedBy: string; contactType: string; contactValue: string; inviteToken: string; teamName?: string; ownerName?: string }): Promise<LeagueInvite>;
  getLeagueInvites(leagueId: number): Promise<LeagueInvite[]>;
  updateInviteStatus(id: number, status: string): Promise<void>;

  // Transfer commissioner
  transferCommissioner(leagueId: number, newCommissionerId: string): Promise<void>;

  // Weekly award events
  getWeeklyAwardEvent(leagueId: number, week: number): Promise<WeeklyAwardEvent | undefined>;
  createWeeklyAwardEvent(event: InsertWeeklyAwardEvent): Promise<WeeklyAwardEvent>;
  updateWeeklyAwardEvent(id: number, updates: { hpsWalletCredited?: boolean; lpsSmssSent?: boolean }): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return authStorage.getUser(id);
  }

  async updateUserRole(id: string, role: string): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, id));
  }

  async updateUserStripeConnect(id: string, accountId: string): Promise<void> {
    await db.update(users).set({ stripeConnectAccountId: accountId }).where(eq(users.id, id));
  }

  async updateUserStripeConnectOnboarded(id: string): Promise<void> {
    await db.update(users).set({ stripeConnectOnboarded: new Date() }).where(eq(users.id, id));
  }

  async isUserAdmin(id: string): Promise<boolean> {
    const user = await this.getUser(id);
    return user?.role === 'admin' || user?.role === 'super_admin';
  }

  async getAllLeagues(): Promise<League[]> {
    return await db.select().from(leagues).orderBy(desc(leagues.createdAt));
  }

  async getPlatformStats(): Promise<{
    totalLeagues: number;
    totalUsers: number;
    totalPayments: number;
    totalPayouts: number;
    totalFundsCollected: string;
    totalFundsPaidOut: string;
  }> {
    const [leagueCount] = await db.select({ count: sql<number>`count(*)` }).from(leagues);
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [paymentCount] = await db.select({ count: sql<number>`count(*)` }).from(payments);
    const [payoutCount] = await db.select({ count: sql<number>`count(*)` }).from(payouts);
    
    const [fundsCollected] = await db.select({ 
      total: sql<string>`COALESCE(SUM(amount), 0)` 
    }).from(payments).where(eq(payments.status, 'completed'));
    
    const [fundsPaidOut] = await db.select({ 
      total: sql<string>`COALESCE(SUM(amount), 0)` 
    }).from(payouts).where(eq(payouts.status, 'paid'));

    return {
      totalLeagues: Number(leagueCount.count),
      totalUsers: Number(userCount.count),
      totalPayments: Number(paymentCount.count),
      totalPayouts: Number(payoutCount.count),
      totalFundsCollected: fundsCollected.total || "0",
      totalFundsPaidOut: fundsPaidOut.total || "0"
    };
  }

  async createLeague(league: InsertLeague): Promise<League> {
    const [newLeague] = await db.insert(leagues).values(league).returning();
    return newLeague;
  }

  async getLeague(id: number): Promise<LeagueWithMembers | undefined> {
    const league = await db.query.leagues.findFirst({
      where: eq(leagues.id, id),
      with: {
        members: {
          with: {
            user: true
          }
        }
      }
    });
    return league as LeagueWithMembers | undefined;
  }

  async getUserLeagues(userId: string): Promise<League[]> {
    const result = await db.query.leagueMembers.findMany({
        where: eq(leagueMembers.userId, userId),
        with: {
            league: true
        }
    });
    
    return result.map(r => r.league).filter((l): l is League => !!l);
  }

  async updateLeagueTotalDues(id: number, amount: number): Promise<void> {
    await db.update(leagues)
      .set({ totalDues: sql`COALESCE(${leagues.totalDues}, 0) + ${amount}` })
      .where(eq(leagues.id, id));
  }

  async updateLeagueSettings(id: number, settings: any): Promise<void> {
    await db.update(leagues)
      .set({ settings })
      .where(eq(leagues.id, id));
  }

  async updateLeagueName(id: number, name: string): Promise<void> {
    await db.update(leagues)
      .set({ name })
      .where(eq(leagues.id, id));
  }

  async addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember> {
    const [newMember] = await db.insert(leagueMembers).values(member).returning();
    return newMember;
  }

  async getLeagueMember(leagueId: number, userId: string): Promise<LeagueMember | undefined> {
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    return member;
  }

  async getLeagueMemberById(id: number): Promise<LeagueMember | undefined> {
    const [member] = await db.select().from(leagueMembers)
      .where(eq(leagueMembers.id, id));
    return member;
  }

  async updateMemberDetails(id: number, details: { teamName?: string | null; ownerName?: string | null; phoneNumber?: string | null; email?: string | null }): Promise<LeagueMember> {
    const [updated] = await db.update(leagueMembers)
      .set(details)
      .where(eq(leagueMembers.id, id))
      .returning();
    return updated;
  }
  
  async updateMemberStatus(id: number, status: string): Promise<void> {
    await db.update(leagueMembers).set({ paidStatus: status }).where(eq(leagueMembers.id, id));
  }

  async updateMemberPaymentRequestSent(id: number, sent: boolean): Promise<void> {
    await db.update(leagueMembers).set({ 
      paymentRequestSent: sent,
      paymentRequestSentAt: sent ? new Date() : null
    }).where(eq(leagueMembers.id, id));
  }

  async setMemberPaymentToken(id: number, token: string): Promise<void> {
    if (token) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // Token valid for 30 days
      await db.update(leagueMembers).set({ 
        paymentToken: token,
        paymentTokenExpiresAt: expiresAt
      }).where(eq(leagueMembers.id, id));
    } else {
      // Clear the token
      await db.update(leagueMembers).set({ 
        paymentToken: null,
        paymentTokenExpiresAt: null
      }).where(eq(leagueMembers.id, id));
    }
  }

  async getMemberByPaymentToken(token: string): Promise<LeagueMember | undefined> {
    const [member] = await db.select().from(leagueMembers)
      .where(eq(leagueMembers.paymentToken, token));
    return member;
  }

  async linkMemberToUser(memberId: number, userId: string): Promise<void> {
    await db.update(leagueMembers).set({ userId }).where(eq(leagueMembers.id, memberId));
  }

  async deleteLeagueMember(id: number): Promise<void> {
    await db.delete(leagueMembers).where(eq(leagueMembers.id, id));
  }

  async createPayment(payment: InsertPayment & { userId: string; status: string; stripePaymentIntentId?: string | null }): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values({
      leagueId: payment.leagueId,
      userId: payment.userId,
      amount: payment.amount,
      status: payment.status,
      stripePaymentIntentId: payment.stripePaymentIntentId
    }).returning();
    return newPayment;
  }

  async createPayout(payout: InsertPayout & { status: string; feeAmount?: string }): Promise<Payout> {
    const [newPayout] = await db.insert(payouts).values({
      leagueId: payout.leagueId,
      userId: payout.userId,
      amount: payout.amount,
      reason: payout.reason,
      week: payout.week,
      status: payout.status,
      payoutType: payout.payoutType || 'standard',
      feeAmount: payout.feeAmount || "0"
    }).returning();
    return newPayout;
  }

  async getLeagueTransactions(leagueId: number): Promise<{ payments: Payment[], payouts: Payout[] }> {
    const leaguePayments = await db.select().from(payments).where(eq(payments.leagueId, leagueId)).orderBy(desc(payments.createdAt));
    const leaguePayouts = await db.select().from(payouts).where(eq(payouts.leagueId, leagueId)).orderBy(desc(payouts.createdAt));
    return { payments: leaguePayments, payouts: leaguePayouts };
  }

  async addWeeklyScore(score: InsertWeeklyScore): Promise<WeeklyScore> {
    const [newScore] = await db.insert(weeklyScores).values({
      leagueId: score.leagueId,
      userId: score.userId,
      week: score.week,
      score: score.score,
      source: score.source || 'manual'
    }).returning();
    return newScore;
  }

  async updateWeeklyScore(id: number, score: string): Promise<void> {
    await db.update(weeklyScores).set({ score }).where(eq(weeklyScores.id, id));
  }

  async getWeeklyScores(leagueId: number, week: number): Promise<WeeklyScore[]> {
    return await db.select().from(weeklyScores)
      .where(and(eq(weeklyScores.leagueId, leagueId), eq(weeklyScores.week, week)))
      .orderBy(desc(weeklyScores.score));
  }

  async getHighestScorerForWeek(leagueId: number, week: number): Promise<WeeklyScore | undefined> {
    const scores = await this.getWeeklyScores(leagueId, week);
    return scores.length > 0 ? scores[0] : undefined;
  }

  async getLowestScorerForWeek(leagueId: number, week: number): Promise<WeeklyScore | undefined> {
    const scores = await this.getWeeklyScores(leagueId, week);
    return scores.length > 0 ? scores[scores.length - 1] : undefined;
  }

  // Platform fee methods
  async createPlatformFee(fee: InsertPlatformFee): Promise<PlatformFee> {
    const [newFee] = await db.insert(platformFees).values({
      payoutId: fee.payoutId,
      leagueId: fee.leagueId,
      amount: fee.amount,
      feeType: fee.feeType || 'instant_payout'
    }).returning();
    return newFee;
  }

  async updatePlatformFeeStatus(id: number, status: string, stripeTransferId?: string): Promise<void> {
    await db.update(platformFees).set({ 
      status, 
      stripeTransferId: stripeTransferId || null 
    }).where(eq(platformFees.id, id));
  }

  async getTotalPlatformFees(): Promise<string> {
    const [result] = await db.select({ 
      total: sql<string>`COALESCE(SUM(amount), 0)` 
    }).from(platformFees).where(eq(platformFees.status, 'transferred'));
    return result.total || "0";
  }

  // Stripe-related storage methods
  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  // Member wallet methods
  async getOrCreateWallet(leagueId: number, userId: string): Promise<MemberWallet> {
    const existing = await this.getMemberWallet(leagueId, userId);
    if (existing) return existing;

    const [newWallet] = await db.insert(memberWallets).values({
      leagueId,
      userId,
      availableBalance: "0",
      pendingBalance: "0",
      totalEarnings: "0",
      totalWithdrawn: "0"
    }).returning();
    return newWallet;
  }

  async getMemberWallet(leagueId: number, userId: string): Promise<MemberWallet | undefined> {
    const [wallet] = await db.select().from(memberWallets)
      .where(and(eq(memberWallets.leagueId, leagueId), eq(memberWallets.userId, userId)));
    return wallet;
  }

  async getMemberWalletById(walletId: number): Promise<MemberWallet | undefined> {
    const [wallet] = await db.select().from(memberWallets).where(eq(memberWallets.id, walletId));
    return wallet;
  }

  async getUserWallets(userId: string): Promise<MemberWallet[]> {
    return await db.select().from(memberWallets).where(eq(memberWallets.userId, userId));
  }

  async getLeagueWallets(leagueId: number): Promise<MemberWallet[]> {
    return await db.select().from(memberWallets).where(eq(memberWallets.leagueId, leagueId));
  }

  async creditWallet(walletId: number, amount: string, sourceType: string, sourceId: number | null, description: string): Promise<WalletTransaction> {
    const wallet = await this.getMemberWalletById(walletId);
    if (!wallet) throw new Error("Wallet not found");

    const newBalance = (Number(wallet.availableBalance) + Number(amount)).toFixed(2);
    const newTotalEarnings = (Number(wallet.totalEarnings) + Number(amount)).toFixed(2);

    await db.update(memberWallets).set({
      availableBalance: newBalance,
      totalEarnings: newTotalEarnings,
      updatedAt: new Date()
    }).where(eq(memberWallets.id, walletId));

    const [transaction] = await db.insert(walletTransactions).values({
      walletId,
      leagueId: wallet.leagueId,
      userId: wallet.userId,
      type: 'credit',
      amount,
      sourceType,
      sourceId,
      description,
      balanceAfter: newBalance
    }).returning();
    return transaction;
  }

  async debitWallet(walletId: number, amount: string, sourceType: string, sourceId: number | null, description: string): Promise<WalletTransaction> {
    const wallet = await this.getMemberWalletById(walletId);
    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = Number(wallet.availableBalance);
    if (currentBalance < Number(amount)) throw new Error("Insufficient balance");

    const newBalance = (currentBalance - Number(amount)).toFixed(2);
    const newTotalWithdrawn = (Number(wallet.totalWithdrawn) + Number(amount)).toFixed(2);

    await db.update(memberWallets).set({
      availableBalance: newBalance,
      totalWithdrawn: newTotalWithdrawn,
      updatedAt: new Date()
    }).where(eq(memberWallets.id, walletId));

    const [transaction] = await db.insert(walletTransactions).values({
      walletId,
      leagueId: wallet.leagueId,
      userId: wallet.userId,
      type: 'debit',
      amount,
      sourceType,
      sourceId,
      description,
      balanceAfter: newBalance
    }).returning();
    return transaction;
  }

  async getWalletTransactions(walletId: number): Promise<WalletTransaction[]> {
    return await db.select().from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(desc(walletTransactions.createdAt));
  }

  async getLeagueTreasury(leagueId: number): Promise<{ totalInflow: string; totalOutflow: string; availableBalance: string }> {
    const [inflow] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`
    }).from(payments).where(and(eq(payments.leagueId, leagueId), eq(payments.status, 'completed')));

    const [outflow] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`
    }).from(payouts).where(and(eq(payouts.leagueId, leagueId), eq(payouts.status, 'paid')));

    const totalIn = Number(inflow.total || 0);
    const totalOut = Number(outflow.total || 0);

    return {
      totalInflow: inflow.total || "0",
      totalOutflow: outflow.total || "0",
      availableBalance: (totalIn - totalOut).toFixed(2)
    };
  }

  // Withdrawal request methods
  async createWithdrawalRequest(request: InsertWithdrawalRequest): Promise<WithdrawalRequest> {
    const [newRequest] = await db.insert(withdrawalRequests).values({
      walletId: request.walletId,
      leagueId: request.leagueId,
      userId: request.userId,
      amount: request.amount,
      payoutType: request.payoutType || 'standard',
      feeAmount: request.feeAmount || "0",
      netAmount: request.netAmount
    }).returning();
    return newRequest;
  }

  async getWithdrawalRequest(id: number): Promise<WithdrawalRequest | undefined> {
    const [request] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id));
    return request;
  }

  async getUserWithdrawals(userId: string): Promise<WithdrawalRequest[]> {
    return await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.userId, userId))
      .orderBy(desc(withdrawalRequests.requestedAt));
  }

  async updateWithdrawalStatus(id: number, status: string, stripeTransferId?: string, failureReason?: string): Promise<void> {
    await db.update(withdrawalRequests).set({
      status,
      stripeTransferId: stripeTransferId || null,
      failureReason: failureReason || null,
      processedAt: status === 'completed' || status === 'failed' ? new Date() : null
    }).where(eq(withdrawalRequests.id, id));
  }

  // LPS Payment Request methods
  async createLpsPaymentRequest(request: InsertLpsPaymentRequest): Promise<LpsPaymentRequest> {
    const [newRequest] = await db.insert(lpsPaymentRequests).values({
      leagueId: request.leagueId,
      userId: request.userId,
      week: request.week,
      amount: request.amount,
      paymentToken: request.paymentToken,
      phoneNumber: request.phoneNumber || null
    }).returning();
    return newRequest;
  }

  async getLpsPaymentByToken(token: string): Promise<LpsPaymentRequest | undefined> {
    const [request] = await db.select().from(lpsPaymentRequests)
      .where(eq(lpsPaymentRequests.paymentToken, token));
    return request;
  }

  async updateLpsPaymentStatus(id: number, status: string): Promise<void> {
    await db.update(lpsPaymentRequests).set({
      status,
      paidAt: status === 'paid' ? new Date() : null
    }).where(eq(lpsPaymentRequests.id, id));
  }

  async markLpsSmsAsSent(id: number): Promise<void> {
    await db.update(lpsPaymentRequests).set({ smsSent: true })
      .where(eq(lpsPaymentRequests.id, id));
  }

  // Member phone number methods
  async updateMemberPhoneNumber(memberId: number, phoneNumber: string): Promise<void> {
    await db.update(leagueMembers).set({ phoneNumber })
      .where(eq(leagueMembers.id, memberId));
  }

  async updateMemberEspnTeamId(memberId: number, espnTeamId: string): Promise<void> {
    await db.update(leagueMembers).set({ externalTeamId: espnTeamId })
      .where(eq(leagueMembers.id, memberId));
  }

  async getUnpaidMembersWithPhone(leagueId: number): Promise<LeagueMember[]> {
    return await db.select().from(leagueMembers)
      .where(and(
        eq(leagueMembers.leagueId, leagueId),
        eq(leagueMembers.paidStatus, 'unpaid')
      ));
  }

  // Payment reminder methods
  async createPaymentReminder(reminder: InsertPaymentReminder): Promise<PaymentReminder> {
    const [newReminder] = await db.insert(paymentReminders).values({
      leagueId: reminder.leagueId,
      userId: reminder.userId,
      type: reminder.type,
      phoneNumber: reminder.phoneNumber || null
    }).returning();
    return newReminder;
  }

  async updateReminderStatus(id: number, status: string): Promise<void> {
    await db.update(paymentReminders).set({
      status,
      sentAt: status === 'sent' ? new Date() : null
    }).where(eq(paymentReminders.id, id));
  }

  async getLeagueReminders(leagueId: number): Promise<PaymentReminder[]> {
    return await db.select().from(paymentReminders)
      .where(eq(paymentReminders.leagueId, leagueId))
      .orderBy(desc(paymentReminders.createdAt));
  }

  // League start date
  async updateLeagueStartDate(leagueId: number, startDate: Date): Promise<void> {
    await db.update(leagues).set({ startDate })
      .where(eq(leagues.id, leagueId));
  }

  async deleteLeague(leagueId: number): Promise<void> {
    // Delete all related data in order (children first, then parent)
    // This handles foreign key constraints properly
    
    // Get all wallets for this league
    const leagueWallets = await db.select().from(memberWallets)
      .where(eq(memberWallets.leagueId, leagueId));
    const walletIds = leagueWallets.map(w => w.id);
    
    // Delete withdrawal requests first (references wallets)
    if (walletIds.length > 0) {
      await db.delete(withdrawalRequests)
        .where(inArray(withdrawalRequests.walletId, walletIds));
    }
    
    // Delete wallet transactions (references wallets)
    if (walletIds.length > 0) {
      await db.delete(walletTransactions)
        .where(inArray(walletTransactions.walletId, walletIds));
    }
    
    // Delete member wallets
    await db.delete(memberWallets)
      .where(eq(memberWallets.leagueId, leagueId));
    
    // Delete LPS payment requests
    await db.delete(lpsPaymentRequests)
      .where(eq(lpsPaymentRequests.leagueId, leagueId));
    
    // Delete payment reminders
    await db.delete(paymentReminders)
      .where(eq(paymentReminders.leagueId, leagueId));
    
    // Delete league messages
    await db.delete(leagueMessages)
      .where(eq(leagueMessages.leagueId, leagueId));
    
    // Delete weekly scores
    await db.delete(weeklyScores)
      .where(eq(weeklyScores.leagueId, leagueId));
    
    // Delete payouts
    await db.delete(payouts)
      .where(eq(payouts.leagueId, leagueId));
    
    // Delete payments
    await db.delete(payments)
      .where(eq(payments.leagueId, leagueId));
    
    // Delete platform fees
    await db.delete(platformFees)
      .where(eq(platformFees.leagueId, leagueId));
    
    // Delete league members
    await db.delete(leagueMembers)
      .where(eq(leagueMembers.leagueId, leagueId));
    
    // Finally delete the league itself
    await db.delete(leagues)
      .where(eq(leagues.id, leagueId));
  }

  async createLeagueMessage(leagueId: number, userId: string, content: string): Promise<LeagueMessage> {
    const [message] = await db.insert(leagueMessages)
      .values({ leagueId, userId, content })
      .returning();
    return message;
  }

  async getLeagueMessages(leagueId: number, limit: number = 50): Promise<(LeagueMessage & { user?: User })[]> {
    const results = await db.select({
      message: leagueMessages,
      user: users
    })
      .from(leagueMessages)
      .leftJoin(users, eq(leagueMessages.userId, users.id))
      .where(eq(leagueMessages.leagueId, leagueId))
      .orderBy(desc(leagueMessages.createdAt))
      .limit(limit);
    
    return results.map(row => ({
      ...row.message,
      user: row.user || undefined
    }));
  }

  async getLeagueMessage(messageId: number): Promise<LeagueMessage | undefined> {
    const [message] = await db.select().from(leagueMessages).where(eq(leagueMessages.id, messageId));
    return message;
  }

  async deleteLeagueMessage(messageId: number): Promise<void> {
    await db.delete(leagueMessages).where(eq(leagueMessages.id, messageId));
  }

  // League invites
  async createLeagueInvite(invite: { leagueId: number; invitedBy: string; contactType: string; contactValue: string; inviteToken: string; teamName?: string; ownerName?: string }): Promise<LeagueInvite> {
    const [result] = await db.insert(leagueInvites).values(invite).returning();
    return result;
  }

  async getLeagueInvites(leagueId: number): Promise<LeagueInvite[]> {
    return db.select().from(leagueInvites).where(eq(leagueInvites.leagueId, leagueId)).orderBy(desc(leagueInvites.createdAt));
  }

  async updateInviteStatus(id: number, status: string): Promise<void> {
    await db.update(leagueInvites).set({ status }).where(eq(leagueInvites.id, id));
  }

  async transferCommissioner(leagueId: number, newCommissionerId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Update league commissioner
      await tx.update(leagues).set({ commissionerId: newCommissionerId }).where(eq(leagues.id, leagueId));
      
      // Update old commissioner's role to member
      await tx.update(leagueMembers)
        .set({ role: 'member' })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.role, 'commissioner')));
      
      // Update new commissioner's role
      await tx.update(leagueMembers)
        .set({ role: 'commissioner' })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, newCommissionerId)));
    });
  }

  // Weekly award events
  async getWeeklyAwardEvent(leagueId: number, week: number): Promise<WeeklyAwardEvent | undefined> {
    const [event] = await db.select().from(weeklyAwardEvents)
      .where(and(eq(weeklyAwardEvents.leagueId, leagueId), eq(weeklyAwardEvents.week, week)));
    return event;
  }

  async createWeeklyAwardEvent(event: InsertWeeklyAwardEvent): Promise<WeeklyAwardEvent> {
    const [created] = await db.insert(weeklyAwardEvents).values(event).returning();
    return created;
  }

  async updateWeeklyAwardEvent(id: number, updates: { hpsWalletCredited?: boolean; lpsSmssSent?: boolean }): Promise<void> {
    await db.update(weeklyAwardEvents).set(updates).where(eq(weeklyAwardEvents.id, id));
  }
}

export const storage = new DatabaseStorage();
