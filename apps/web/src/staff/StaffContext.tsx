import { createContext, useContext, useMemo } from 'react';
import type { StaffLoginResponse, TeamLoginCard } from '@magic-potion/shared';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from '../lib/api';
import type { StaffRoute } from './router';

// The logged-in staff member and REST helpers that carry their token. A request refused because
// the login has ended sends them back to the login screen with a message.

export interface StaffApi {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body: unknown) => Promise<T>;
  patch: <T>(path: string, body: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
  upload: <T>(path: string, file: Blob) => Promise<T>;
}

// Team passwords are shown only once, right after they are made. They stay in memory (never in
// storage) until the admin leaves the game or logs out.
export interface FreshLogins {
  gameId: string;
  logins: TeamLoginCard[];
}

export interface StaffContextValue {
  login: StaffLoginResponse;
  api: StaffApi;
  go: (route: StaffRoute) => void;
  freshLogins: FreshLogins | null;
  setFreshLogins: (value: FreshLogins | null) => void;
}

const Ctx = createContext<StaffContextValue | null>(null);

export const StaffProvider = Ctx.Provider;

export function useStaff(): StaffContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useStaff needs a StaffProvider');
  return value;
}

export function useStaffApi(token: string, onLoggedOut: (message: string) => void): StaffApi {
  return useMemo(() => {
    const guard = async <T,>(p: Promise<T>): Promise<T> => {
      try {
        return await p;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) onLoggedOut(error.message);
        throw error;
      }
    };
    const path = (p: string) => `/api/staff${p}`;
    return {
      get: (p) => guard(apiGet(path(p), token)),
      post: (p, body) => guard(apiPost(path(p), body, token)),
      put: (p, body) => guard(apiPut(path(p), body, token)),
      patch: (p, body) => guard(apiPatch(path(p), body, token)),
      del: (p) => guard(apiDelete(path(p), token)),
      upload: (p, file) => guard(apiUpload(path(p), file, token)),
    };
  }, [token, onLoggedOut]);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
