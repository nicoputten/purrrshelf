import { endpoints, type Budget, type BudgetCounter } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { PreHandler } from '../auth/authenticate.js';
import { BUDGET_WINDOW_MS, type BudgetStatus, type IndexerBudget } from './budget.js';

export interface BudgetRoutesOptions {
  budget: IndexerBudget;
  requireAuth: PreHandler;
}

function counter(s: BudgetStatus): BudgetCounter {
  return {
    limit: s.limit,
    used: s.used,
    left: s.left,
    nextFreeAt: s.nextFreeAt.toISOString(),
    limitReachedUntil: s.limitReachedUntil?.toISOString() ?? null,
  };
}

/** Read-only view of the budget. Spends nothing. */
export const budgetRoutes: FastifyPluginAsyncZod<BudgetRoutesOptions> = async (app, opts) => {
  const { budget } = endpoints;
  app.get(
    budget.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: budget.response } } },
    async (): Promise<Budget> => {
      const overview = opts.budget.overview();
      const nextFree = overview.map((o) => o.search.nextFreeAt.getTime());
      return {
        windowMinutes: BUDGET_WINDOW_MS / 60_000,
        searches: {
          limit: overview.reduce((n, o) => n + o.search.limit, 0),
          left: overview.reduce((n, o) => n + o.search.left, 0),
          nextFreeAt: nextFree.length ? new Date(Math.min(...nextFree)).toISOString() : null,
        },
        indexers: overview.map((o) => ({
          indexerId: o.indexer.id,
          name: o.indexer.name,
          priority: o.indexer.priority,
          searches: counter(o.search),
          grabs: counter(o.grab),
        })),
      };
    },
  );
};
