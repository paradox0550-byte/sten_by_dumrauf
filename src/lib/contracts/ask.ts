import type { ProposedMemory } from './memory';
import { z } from 'zod';

/**
 * Явный интерфейс запроса POST /ask.
 * Backend использует .strict() — любое лишнее поле отклонится.
 */
export interface AskRequest {
  question: string;
  messages?: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }[];
  include_tool_results?: boolean;
  scope?: {
    period: string;
    project_id: string | null;
    branch_id: string | null;
    restaurant_id: string | null;
    department_id: string | null;
  };
}

export const AskRequestSchema: z.ZodType<AskRequest> = z.object({
  question: z.string().trim().min(1).max(8000),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string().max(20000),
  })).max(50).optional(),
  include_tool_results: z.boolean().optional().default(false),
  scope: z.object({
    period: z.string(),
    project_id: z.string().nullable(),
    branch_id: z.string().nullable(),
    restaurant_id: z.string().nullable(),
    department_id: z.string().nullable(),
  }).optional(),
}).strict();

export interface AskSource {
  id?: string;
  uri?: string;
  title?: string;
  kind?: string;
  excerpt?: string;
}

export interface AskResponse {
  answer?: string;
  message?: string;
  model?: string;
  sources?: AskSource[];
  tools_used?: Array<{ name: string; args?: unknown; ok?: boolean; ms?: number }>;
  tool_results?: Array<{ name: string; args?: unknown; result?: unknown }>;
  proposed_memory: ProposedMemory[] | null;
}

export const AskResponseSchema = z.object({
  answer: z.string().optional(),
  message: z.string().optional(),
  model: z.string().optional(),
  sources: z.array(z.object({
    id: z.string().optional(),
    uri: z.string().optional(),
    title: z.string().optional(),
    kind: z.string().optional(),
    excerpt: z.string().optional(),
  })).optional(),
  proposed_memory: z.array(z.object({
    kind: z.enum(['fact','decision','cause','action','manager_note','pattern']),
    title: z.string(),
    content: z.string(),
    evidence: z.record(z.unknown()).optional(),
  })).nullable().optional(),
}).passthrough();