import{z}from'zod';

export const AiSkillsSchema=z.object({
  foodCost:z.number().finite().min(0).max(100).optional(),
  laborCost:z.number().finite().min(0).max(100).optional(),
  shiftHours:z.number().finite().min(1).max(24).optional(),
  tone:z.enum(['brief','expanded','official']).optional(),
  documents:z.boolean().optional(),
  history:z.boolean().optional(),
  excludeCapex:z.boolean().optional(),
}).strict();

export type AiSkills=z.infer<typeof AiSkillsSchema>;
