import { create } from "zustand";
import { AuthUser } from "../types";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("mysorat_token"),
  user: JSON.parse(localStorage.getItem("mysorat_user") ?? "null"),
  setAuth: (token, user) => {
    localStorage.setItem("mysorat_token", token);
    localStorage.setItem("mysorat_user", JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("mysorat_token");
    localStorage.removeItem("mysorat_user");
    set({ token: null, user: null });
  },
}));
