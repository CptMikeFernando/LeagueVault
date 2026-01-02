import { db } from "./db";
import { 
  users, leagues, leagueMembers, payments, payouts, weeklyScores,
  type User,
  type League, type InsertLeague,
  type LeagueMember, type InsertLeagueMember,
  type Payment, type InsertPayment,
  type Payout, type InsertPayout,
  type WeeklyScore, type InsertWeeklyScore,
  type LeagueWithMembers
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;

  createLeague(league: InsertLeague): Promise<League>;
  getLeague(id: number): Promise<LeagueWithMembers | undefined>;
  getUserLeagues(userId: string): Promise<League[]>;
  updateLeagueTotalDues(id: number, amount: number): Promise<void>;
  updateLeagueSettings(id: number, settings: any): Promise<void>;

  addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember>;
  getLeagueMember(leagueId: number, userId: string): Promise<LeagueMember | undefined>;
  updateMemberStatus(id: number, status: string): Promise<void>;

  createPayment(payment: InsertPayment & { userId: string; status: string }): Promise<Payment>;
  createPayout(payout: InsertPayout & { status: string }): Promise<Payout>;
  getLeagueTransactions(leagueId: number): Promise<{ payments: Payment[], payouts: Payout[] }>;
  
  addWeeklyScore(score: InsertWeeklyScore): Promise<WeeklyScore>;
  getWeeklyScores(leagueId: number, week: number): Promise<WeeklyScore[]>;
  getHighestScorerForWeek(leagueId: number, week: number): Promise<WeeklyScore | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return authStorage.getUser(id);
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

  async addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember> {
    const [newMember] = await db.insert(leagueMembers).values(member).returning();
    return newMember;
  }

  async getLeagueMember(leagueId: number, userId: string): Promise<LeagueMember | undefined> {
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    return member;
  }
  
  async updateMemberStatus(id: number, status: string): Promise<void> {
    await db.update(leagueMembers).set({ paidStatus: status }).where(eq(leagueMembers.id, id));
  }

  async createPayment(payment: InsertPayment & { userId: string; status: string }): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values({
      leagueId: payment.leagueId,
      userId: payment.userId,
      amount: payment.amount,
      status: payment.status,
      stripePaymentIntentId: payment.stripePaymentIntentId
    }).returning();
    return newPayment;
  }

  async createPayout(payout: InsertPayout & { status: string }): Promise<Payout> {
    const [newPayout] = await db.insert(payouts).values({
      leagueId: payout.leagueId,
      userId: payout.userId,
      amount: payout.amount,
      reason: payout.reason,
      week: payout.week,
      status: payout.status
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
      score: score.score
    }).returning();
    return newScore;
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
}

export const storage = new DatabaseStorage();
