import axios, { AxiosError, type AxiosResponse } from "axios";
import { z } from "zod";
import {
  RefreshTokenResponseSchema,
} from "@notes/shared-types";
import { useAuthStore } from "../../store/authStore";

const successEnvelopeSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  status: z.literal("success"),
  data: dataSchema,
  timestamp: z.string(),
  requestId: z.string().optional(),
});

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1),
});

const { VITE_API_BASE_URL: apiBaseUrl } = envSchema.parse(import.meta.env);

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 15_000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (typeof token === "string" && token.length > 0) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | undefined> | undefined;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const responseStatus = error.response?.status;
    const original = error.config;

    if (responseStatus !== 401 || original == null) {
      return Promise.reject(error);
    }

    const url = original.url ?? "";
    const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/signup") || url.includes("/auth/refresh");

    if (isAuthEndpoint || (original as AxiosRequestConfigWithRetry).__retry) {
      return Promise.reject(error);
    }

    (original as AxiosRequestConfigWithRetry).__retry = true;

    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = undefined;
    });

    const token = await refreshPromise;
    if (token == null) {
      useAuthStore.getState().clearAuth();
      return Promise.reject(error);
    }

    (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;

    return apiClient.request(original);
  },
);

type AxiosRequestConfigWithRetry = {
  __retry?: boolean;
};

async function refreshAccessToken(): Promise<string | undefined> {
  try {
    const response = await axios.post(`${apiBaseUrl}/auth/refresh`, undefined, {
      withCredentials: true,
      timeout: 15_000,
    });

    const payload = parseSuccessEnvelope(response, RefreshTokenResponseSchema);
    const data = payload.data;

    useAuthStore.getState().setAuthSession({
      accessToken: data.tokens.accessToken,
      user: data.user,
    });

    return data.tokens.accessToken;
  } catch {
    return undefined;
  }
}

export function parseSuccessEnvelope<T>(
  response: AxiosResponse<unknown>,
  schema: z.ZodType<T>,
) {
  return successEnvelopeSchema(schema).parse(response.data);
}

export function getApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (error.code === "ECONNABORTED") {
      return "Request timed out. Please check your connection and try again.";
    }

    if (error.response == null) {
      return "Cannot reach the web service. Please ensure it is running and try again.";
    }

    const payload = error.response.data as unknown;
    if (typeof payload === "object" && payload != null) {
      const message = (payload as { error?: { message?: unknown } }).error?.message;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }

    if (status != null && status >= 500) {
      return "Web service is currently unavailable. Please try again shortly.";
    }

    if (status === 401) {
      return "Your session expired. Please sign in again.";
    }

    if (typeof error.message === "string" && error.message.trim().length > 0 && error.message !== "Network Error") {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
