-- STEN shared FOT planning and schedule history.
-- Apply manually after review; this file is intentionally not executed by runtime schema bootstrap.
BEGIN;

CREATE TABLE IF NOT EXISTS fot_schedule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  project_id UUID,
  branch_id UUID,
  restaurant_id UUID,
  department_id UUID,
  scope_key TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  file_name TEXT NOT NULL,
  norm_hours NUMERIC(10,2) NOT NULL CHECK (norm_hours >= 0 AND norm_hours <= 744),
  ndfl NUMERIC(18,2) CHECK (ndfl IS NULL OR ndfl >= 0),
  calculations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fot_schedule_history_scope_period_uniq UNIQUE (organization_id, scope_key, period)
);

CREATE INDEX IF NOT EXISTS idx_fot_schedule_history_scope_period
  ON fot_schedule_history (organization_id, scope_key, period DESC);

CREATE TABLE IF NOT EXISTS fot_staffing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  project_id UUID,
  branch_id UUID,
  restaurant_id UUID,
  department_id UUID,
  scope_key TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fot_staffing_plans_scope_period_uniq UNIQUE (organization_id, scope_key, period)
);

CREATE INDEX IF NOT EXISTS idx_fot_staffing_plans_scope_period
  ON fot_staffing_plans (organization_id, scope_key, period);

CREATE TABLE IF NOT EXISTS fot_custom_position_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  project_id UUID,
  branch_id UUID,
  restaurant_id UUID,
  department_id UUID,
  scope_key TEXT NOT NULL,
  positions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fot_custom_position_sets_scope_uniq UNIQUE (organization_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_fot_custom_position_sets_scope
  ON fot_custom_position_sets (organization_id, scope_key);

COMMIT;
