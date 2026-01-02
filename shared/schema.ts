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
  startDate: timestamp("start_date"), // For pre-season payment reminders
  totalDues: decimal("total_dues", { precision: 10, scale: 2 }).notNull().default("0"),
  settings: jsonb("settings").$type<{
    entryFee: number;
    weeklyHighScorePrize: number;
    weeklyLowScoreFee: number;
    weeklyLowScoreFeeEnabled: boolean;
    payoutRules: string;
    // Legacy fields for backwards compatibility
    weeklyPayoutAmount?: number;
    seasonDues?: number;
    lowestScorerFee?: number;
    lowestScorerFeeEnabled?: boolean;
  }>().default({ 
    entryFee: 0, 
    weeklyHighScorePrize: 0, 
    weeklyLowScoreFee: 0, 
    weeklyLowScoreFeeEnabled: false,
    payoutRules: "" 
  }),
  lastScoreSync: timestamp("last_score_sync"),
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
  externalTeamId: text("external_team_id"), // ESPN/Yahoo team ID for score syncing
  phoneNumber: text("phone_number"), // For SMS payment reminders
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
  payoutType: text("payout_type").notNull().default("standard"), // 'instant', 'standard'
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }).default("0"), // Fee charged for instant payouts
  createdAt: timestamp("created_at").defaultNow(),
});

// === PLATFORM FEES (Revenue from instant payouts) ===
export const platformFees = pgTable("platform_fees", {
  id: serial("id").primaryKey(),
  payoutId: integer("payout_id").notNull(),
  leagueId: integer("league_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  feeType: text("fee_type").notNull().default("instant_payout"), // 'instant_payout'
  status: text("status").notNull().default("pending"), // 'pending', 'transferred', 'failed'
  stripeTransferId: text("stripe_transfer_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformFeesRelations = relations(platformFees, ({ one }) => ({
  payout: one(payouts, {
    fields: [platformFees.payoutId],
    references: [payouts.id],
  }),
  league: one(leagues, {
    fields: [platformFees.leagueId],
    references: [leagues.id],
  }),
}));

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
  source: text("source").notNull().default("manual"), // 'manual', 'espn', 'yahoo', 'auto'
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

// === MEMBER WALLETS (Individual balances per league) ===
export const memberWallets = pgTable("member_wallets", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  availableBalance: decimal("available_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  pendingBalance: decimal("pending_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  totalEarnings: decimal("total_earnings", { precision: 10, scale: 2 }).notNull().default("0"),
  totalWithdrawn: decimal("total_withdrawn", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const memberWalletsRelations = relations(memberWallets, ({ one, many }) => ({
  league: one(leagues, {
    fields: [memberWallets.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [memberWallets.userId],
    references: [users.id],
  }),
  transactions: many(walletTransactions),
}));

// === WALLET TRANSACTIONS (Immutable ledger) ===
export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // 'credit', 'debit'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  sourceType: text("source_type").notNull(), // 'payout', 'withdrawal', 'adjustment', 'refund'
  sourceId: integer("source_id"), // Reference to payout/withdrawal ID
  description: text("description"),
  balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(memberWallets, {
    fields: [walletTransactions.walletId],
    references: [memberWallets.id],
  }),
  league: one(leagues, {
    fields: [walletTransactions.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [walletTransactions.userId],
    references: [users.id],
  }),
}));

// === WITHDRAWAL REQUESTS ===
export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  payoutType: text("payout_type").notNull().default("standard"), // 'instant', 'standard'
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }).default("0"),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),
  stripeTransferId: text("stripe_transfer_id"),
  failureReason: text("failure_reason"),
  requestedAt: timestamp("requested_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const withdrawalRequestsRelations = relations(withdrawalRequests, ({ one }) => ({
  wallet: one(memberWallets, {
    fields: [withdrawalRequests.walletId],
    references: [memberWallets.id],
  }),
  league: one(leagues, {
    fields: [withdrawalRequests.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [withdrawalRequests.userId],
    references: [users.id],
  }),
}));

// === LPS PAYMENT REQUESTS (Lowest Point Scorer Penalties) ===
export const lpsPaymentRequests = pgTable("lps_payment_requests", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  week: integer("week").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'paid', 'cancelled'
  paymentToken: text("payment_token").notNull(), // Unique token for payment link
  smsSent: boolean("sms_sent").notNull().default(false),
  phoneNumber: text("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const lpsPaymentRequestsRelations = relations(lpsPaymentRequests, ({ one }) => ({
  league: one(leagues, {
    fields: [lpsPaymentRequests.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [lpsPaymentRequests.userId],
    references: [users.id],
  }),
}));

// === PAYMENT REMINDERS ===
export const paymentReminders = pgTable("payment_reminders", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // 'pre_season', 'weekly', 'final'
  phoneNumber: text("phone_number"),
  status: text("status").notNull().default("pending"), // 'pending', 'sent', 'failed'
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentRemindersRelations = relations(paymentReminders, ({ one }) => ({
  league: one(leagues, {
    fields: [paymentReminders.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [paymentReminders.userId],
    references: [users.id],
  }),
}));

// === LEAGUE MESSAGES (Message Board) ===
export const leagueMessages = pgTable("league_messages", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leagueMessagesRelations = relations(leagueMessages, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMessages.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [leagueMessages.userId],
    references: [users.id],
  }),
}));

// === LEAGUE INVITES ===
export const leagueInvites = pgTable("league_invites", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  invitedBy: text("invited_by").notNull(),
  contactType: text("contact_type").notNull(), // 'phone' or 'email'
  contactValue: text("contact_value").notNull(), // phone number or email
  teamName: text("team_name"),
  ownerName: text("owner_name"),
  status: text("status").notNull().default("pending"), // 'pending', 'sent', 'accepted', 'expired'
  inviteToken: text("invite_token").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export const leagueInvitesRelations = relations(leagueInvites, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueInvites.leagueId],
    references: [leagues.id],
  }),
}));

// === ZOD SCHEMAS ===
export const insertLeagueSchema = createInsertSchema(leagues).omit({ id: true, createdAt: true, totalDues: true });
export const insertPaymentReminderSchema = createInsertSchema(paymentReminders).omit({ id: true, createdAt: true, sentAt: true, status: true });
export const insertLpsPaymentRequestSchema = createInsertSchema(lpsPaymentRequests).omit({ id: true, createdAt: true, paidAt: true, smsSent: true });
export const insertLeagueMemberSchema = createInsertSchema(leagueMembers).omit({ id: true, joinedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, status: true, stripePaymentIntentId: true });
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, createdAt: true, status: true, feeAmount: true });
export const insertWeeklyScoreSchema = createInsertSchema(weeklyScores).omit({ id: true, createdAt: true });
export const insertPlatformFeeSchema = createInsertSchema(platformFees).omit({ id: true, createdAt: true, status: true, stripeTransferId: true });
export const insertMemberWalletSchema = createInsertSchema(memberWallets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({ id: true, createdAt: true });
export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({ id: true, requestedAt: true, processedAt: true, status: true, stripeTransferId: true, failureReason: true });
export const insertLeagueMessageSchema = createInsertSchema(leagueMessages).omit({ id: true, createdAt: true });
export const insertLeagueInviteSchema = createInsertSchema(leagueInvites).omit({ id: true, createdAt: true, acceptedAt: true, status: true });

// === TYPES ===
export type League = typeof leagues.$inferSelect;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type InsertLeagueMember = z.infer<typeof insertLeagueMemberSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type WeeklyScore = typeof weeklyScores.$inferSelect;
export type InsertWeeklyScore = z.infer<typeof insertWeeklyScoreSchema>;
export type PlatformFee = typeof platformFees.$inferSelect;
export type InsertPlatformFee = z.infer<typeof insertPlatformFeeSchema>;
export type MemberWallet = typeof memberWallets.$inferSelect;
export type InsertMemberWallet = z.infer<typeof insertMemberWalletSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;
export type LpsPaymentRequest = typeof lpsPaymentRequests.$inferSelect;
export type InsertLpsPaymentRequest = z.infer<typeof insertLpsPaymentRequestSchema>;
export type PaymentReminder = typeof paymentReminders.$inferSelect;
export type InsertPaymentReminder = z.infer<typeof insertPaymentReminderSchema>;
export type LeagueMessage = typeof leagueMessages.$inferSelect;
export type InsertLeagueMessage = z.infer<typeof insertLeagueMessageSchema>;
export type LeagueInvite = typeof leagueInvites.$inferSelect;
export type InsertLeagueInvite = z.infer<typeof insertLeagueInviteSchema>;

export type LeagueWithMembers = League & { members: (LeagueMember & { user: typeof users.$inferSelect })[] };
