
import { apiClient } from "../../../api/client";

import type {
  CurrentUserResponse,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
} from "../types";

export const authApi = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>(
      "/auth/login",
      payload
    );

    return data;
  },

  async register(
    payload: RegisterPayload
  ): Promise<RegisterResponse> {
    const { data } = await apiClient.post<RegisterResponse>(
      "/auth/register",
      payload
    );

    return data;
  },

  async me(): Promise<CurrentUserResponse> {
    const { data } =
      await apiClient.get<CurrentUserResponse>("/auth/me");

    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post("/auth/logout");
  },
};
