export type LadarVisualState = 'idle' | 'analyzing' | 'deviation' | 'complete';

export interface LadarServerStatus {
  source: 'server';
  state: LadarVisualState;
  /** Must be explicitly true for a deviation emitted by the trusted analysis result. */
  confirmed?: boolean;
  /** Human-readable explanation supplied with the confirmed result. */
  explanation?: string | null;
}

/**
 * Maps an authoritative analysis result to a visual state.
 * Unknown, local, or incomplete inputs fail closed to idle. This function does
 * not infer a deviation from elapsed time, animation, missing values, or UI state.
 */
export function resolveLadarState(status: LadarServerStatus | null | undefined): LadarVisualState {
  if (!status || status.source !== 'server') return 'idle';
  if (status.state === 'deviation') {
    return status.confirmed === true && Boolean(status.explanation?.trim()) ? 'deviation' : 'idle';
  }
  if (status.state === 'analyzing' || status.state === 'complete' || status.state === 'idle') {
    return status.state;
  }
  return 'idle';
}

export function useLadarState(status: LadarServerStatus | null | undefined): LadarVisualState {
  return resolveLadarState(status);
}
