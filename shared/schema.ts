import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Re-export auth models so they are available
export * from "./models/auth";

// === LEAGUES ===
export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  commissionerId: text("commissioner_id").notNull(), // Links to users.id (which is a string/uuid)
  platform: text("platform").notNull().default("custom"), // 'espn', 'yahoo', 'custom'
  externalLeagueId: text("external_league_id"),
  seasonYear: integer("season_year").notNull(),
  totalDues: decimal("total_dues", { precision: 10, scale: 2 }).notNull().default("0"),
  settings: jsonb("settings").$type<{
    weeklyPayoutAmount: number;
    seasonDues: number;
    payoutRules: string;
  }>().default({ weeklyPayoutAmount: 0, seasonDues: 0, payoutRules: "" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  commissioner: one(users, {
    fields: [leagues.commissionerId],
    references: [users.id],
  }),
  members: many(leagueMembers),
  payments: many(payments),
  payouts: many(payouts),
}));

// === LEAGUE MEMBERS ===
export const leagueMembers = pgTable("league_members", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"), // 'commissioner', 'member'
  teamName: text("team_name"),
  paidStatus: text("paid_status").notNull().default("unpaid"), // 'paid', 'unpaid', 'partial'
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMembers.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [leagueMembers.userId],
    references: [users.id],
  }),
}));

// === PAYMENTS (INCOMING) ===
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'failed'
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  league: one(leagues, {
    fields: [payments.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

// === PAYOUTS (OUTGOING) ===
export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(), // 'weekly_high_score', 'championship', 'other'
  week: integer("week"), // Optional, for weekly payouts
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'paid'
  createdAt: timestamp("created_at").defaultNow(),
});

export const payoutsRelations = relations(payouts, ({ one }) => ({
  league: one(leagues, {
    fields: [payouts.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [payouts.userId],
    references: [users.id],
  }),
}));

// === WEEKLY SCORES (For Automation) ===
export const weeklyScores = pgTable("weekly_scores", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  week: integer("week").notNull(),
  score: decimal("score", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const weeklyScoresRelations = relations(weeklyScores, ({ one }) => ({
  league: one(leagues, {
    fields: [weeklyScores.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [weeklyScores.userId],
    references: [users.id],
  }),
}));

// === ZOD SCHEMAS ===
export const insertLeagueSchema = createInsertSchema(leagues).omit({ id: true, createdAt: true, totalDues: true });
export const insertLeagueMemberSchema = createInsertSchema(leagueMembers).omit({ id: true, joinedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, status: true });
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, createdAt: true, status: true });
export const insertWeeklyScoreSchema = createInsertSchema(weeklyScores).omit({ id: true, createdAt: true });

// === TYPES ===
export type League = typeof leagues.$inferSelect;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type InsertLeagueMember = z.infer<typeof insertLeagueMemberSchema>;
export type Payment = typeof payments.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type WeeklyScore = typeof weeklyScores.$inferSelect;

export type LeagueWithMembers = League & { members: (LeagueMember & { user: typeof users.$inferSelect })[] };
