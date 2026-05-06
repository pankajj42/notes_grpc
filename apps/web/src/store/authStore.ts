import { create } from "zustand";
import type { UserInfo } from "@notes/shared-types";
import { readJwtSessionId } from "../lib/jwt";

type AuthState = {
  accessToken: string | undefined;
  sessionId: string | undefined;
  user: UserInfo | undefined;
  setAuthSession: (input: { accessToken: string; user: UserInfo }) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: undefined,
  sessionId: undefined,
  user: undefined,
  setAuthSession: ({ accessToken, user }) => {
    set({
      accessToken,
      sessionId: readJwtSessionId(accessToken),
      user,
    });
  },
  clearAuth: () => {
    set({ accessToken: undefined, sessionId: undefined, user: undefined });
  },
}));

export function isAuthenticated(): boolean {
  const state = useAuthStore.getState();
  return typeof state.accessToken === "string" && state.accessToken.length > 0;
}
