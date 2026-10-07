export type MemoryKind = 'fact' | 'decision' | 'cause' | 'action' | 'manager_note' | 'pattern';
export type MemoryConfidence = 'unconfirmed' | 'confirmed' | 'rejected';

export interface Memory {
  id: string;
  organization_id: string;
  project_id: string;
  branch_id: string;
  restaurant_id: string;
  department_id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  evidence_json: Record<string, unknown>;
  confidence: MemoryConfidence;
  confirmed_by_user_id: string | null;
  confirmed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProposedMemory {
  kind: MemoryKind;
  title: string;
  content: string;
  evidence?: Record<string, unknown>;
}

export interface MemoryFilters {
  kind?: MemoryKind;
  restaurant_id?: string;
  since?: string;
  limit?: number;
  confidence?: MemoryConfidence;
}

export interface MemoryListResponse {
  memories: Memory[];
}

export interface MemoryCreatePayload {
  scope: {
    project_id?: string | null;
    branch_id?: string | null;
    restaurant_id?: string | null;
    department_id?: string | null;
  };
  kind: MemoryKind;
  title: string;
  content: string;
  evidence?: Record<string, unknown>;
}
