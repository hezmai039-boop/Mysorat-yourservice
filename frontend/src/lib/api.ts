import axios from "axios";
import { useAuthStore } from "../store/auth";

const base = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const api = axios.create({
  baseURL: base ? `${base.replace(/\/$/, "")}/api` : "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mysorat_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? "حدث خطأ، الرجاء المحاولة لاحقاً";
  }
  return "حدث خطأ غير متوقع";
}
