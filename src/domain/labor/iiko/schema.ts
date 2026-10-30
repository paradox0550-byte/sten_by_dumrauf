import { z } from 'zod';

export const ZoneIdSchema = z.enum(['hot', 'cold', 'bar', 'prep', 'dessert', 'unknown']);
export type ZoneId = z.infer<typeof ZoneIdSchema>;

export const IikoRawRow = z.object({
  date: z.string().date(),
  hour: z.number().int().min(0).max(23),
  dish: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(200),
  qty: z.number().finite().nonnegative(),
  revenue: z.number().finite(),
  cost: z.number().finite().optional(),
  orderNumber: z.string().trim().optional(),
});
export const IikoParsedRow = IikoRawRow.extend({ zone: ZoneIdSchema });
export const IikoParsedSales = z.array(IikoParsedRow);
export type IikoParsedRow = z.infer<typeof IikoParsedRow>;
export type IikoParsedSales = z.infer<typeof IikoParsedSales>;
export const IikoUnmappedRow = IikoParsedRow.extend({ zone: z.literal('unknown') });
export type IikoUnmappedRow = z.infer<typeof IikoUnmappedRow>;
