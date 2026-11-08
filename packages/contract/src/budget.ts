import { z } from 'zod';

/** One counter (searches or NZB grabs) of one indexer, over the rolling 60-minute window. */
export const BudgetCounter = z
  .object({
    limit: z.number().int().nonnegative(),
    used: z.number().int().nonnegative(),
    left: z.number().int().nonnegative(),
    /** When the next call may be spent: now if `left > 0` and the indexer is not blocked. */
    nextFreeAt: z.iso.datetime(),
    /** Set while the indexer itself said its limit was reached. */
    limitReachedUntil: z.iso.datetime().nullable(),
  })
  .meta({ id: 'BudgetCounter' });
export type BudgetCounter = z.infer<typeof BudgetCounter>;

export const IndexerBudget = z
  .object({
    indexerId: z.string(),
    name: z.string(),
    /** Lower is queried first. */
    priority: z.number().int(),
    searches: BudgetCounter,
    grabs: BudgetCounter,
  })
  .meta({ id: 'IndexerBudget' });
export type IndexerBudget = z.infer<typeof IndexerBudget>;

export const Budget = z
  .object({
    windowMinutes: z.number().int().positive(),
    /** Totals over all indexers, for the budget pill ("21 / 25 left"). */
    searches: z.object({
      limit: z.number().int().nonnegative(),
      left: z.number().int().nonnegative(),
      /** Earliest moment any indexer can search again; null without indexers. */
      nextFreeAt: z.iso.datetime().nullable(),
    }),
    indexers: z.array(IndexerBudget),
  })
  .meta({ id: 'Budget' });
export type Budget = z.infer<typeof Budget>;
