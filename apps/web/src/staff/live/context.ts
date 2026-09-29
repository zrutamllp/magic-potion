import { createContext, useContext } from 'react';
import type { StaffState } from '@magic-potion/shared';

// What every part of the live dashboard needs: the latest staff state and the clocks.
export interface LiveView {
  gameId: string;
  state: StaffState;
  // When the state arrived, on the monotonic clock, and the monotonic time now.
  receivedAt: number;
  now: number;
  // The server's time now, for "last active" (the state says the server time it was built).
  serverNow: number;
  isAdmin: boolean;
  // Asks the server again for the audit log (it changes after staff actions).
  auditVersion: number;
  openTeam: (teamId: string) => void;
  viewAsTeam: (teamId: string) => void;
}

const Ctx = createContext<LiveView | null>(null);
export const LiveProvider = Ctx.Provider;

export function useLiveView(): LiveView {
  const value = useContext(Ctx);
  if (!value) throw new Error('useLiveView needs a LiveProvider');
  return value;
}
