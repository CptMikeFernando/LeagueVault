import { z } from 'zod';
import { 
  insertLeagueSchema, 
  insertLeagueMemberSchema, 
  insertPaymentSchema, 
  insertPayoutSchema, 
  insertWeeklyScoreSchema,
  leagues,
  leagueMembers,
  payments,
  payouts,
  weeklyScores
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  leagues: {
    list: {
      method: 'GET' as const,
      path: '/api/leagues',
      responses: {
        200: z.array(z.custom<typeof leagues.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/leagues/:id',
      responses: {
        200: z.custom<typeof leagues.$inferSelect & { members: any[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/leagues',
      input: insertLeagueSchema,
      responses: {
        201: z.custom<typeof leagues.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/leagues/:id/join',
      input: z.object({ teamName: z.string() }),
      responses: {
        201: z.custom<typeof leagueMembers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    syncPlatform: {
        method: 'POST' as const,
        path: '/api/leagues/sync',
        input: z.object({ platform: z.enum(['espn', 'yahoo']), leagueUrl: z.string() }),
        responses: {
            200: z.object({
                success: z.boolean(),
                data: z.object({
                    name: z.string(),
                    seasonYear: z.number(),
                    externalId: z.string()
                })
            })
        }
    }
  },
  payments: {
    create: {
      method: 'POST' as const,
      path: '/api/payments',
      input: insertPaymentSchema,
      responses: {
        201: z.custom<typeof payments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/leagues/:id/transactions',
      responses: {
        200: z.object({
            payments: z.array(z.custom<typeof payments.$inferSelect>()),
            payouts: z.array(z.custom<typeof payouts.$inferSelect>())
        })
      }
    }
  },
  payouts: {
    create: {
      method: 'POST' as const,
      path: '/api/payouts',
      input: insertPayoutSchema,
      responses: {
        201: z.custom<typeof payouts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  scores: {
    update: {
      method: 'POST' as const,
      path: '/api/leagues/:id/scores',
      input: insertWeeklyScoreSchema,
      responses: {
        201: z.custom<typeof weeklyScores.$inferSelect>(),
      }
    }
  },
  wallets: {
    myWallets: {
      method: 'GET' as const,
      path: '/api/wallets/me',
      responses: {
        200: z.array(z.any()),
      }
    },
    getWallet: {
      method: 'GET' as const,
      path: '/api/leagues/:id/wallet',
      responses: {
        200: z.any(),
      }
    },
    transactions: {
      method: 'GET' as const,
      path: '/api/wallets/:id/transactions',
      responses: {
        200: z.array(z.any()),
      }
    },
    treasury: {
      method: 'GET' as const,
      path: '/api/leagues/:id/treasury',
      responses: {
        200: z.object({
          totalInflow: z.string(),
          totalOutflow: z.string(),
          availableBalance: z.string(),
        }),
      }
    },
    withdraw: {
      method: 'POST' as const,
      path: '/api/wallets/:id/withdraw',
      input: z.object({
        amount: z.number().positive(),
        payoutType: z.enum(['standard', 'instant']).default('standard'),
      }),
      responses: {
        201: z.any(),
        400: errorSchemas.validation,
      }
    },
    withdrawals: {
      method: 'GET' as const,
      path: '/api/withdrawals/me',
      responses: {
        200: z.array(z.any()),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
