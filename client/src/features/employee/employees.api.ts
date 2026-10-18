
import { apiClient } from "../../api/client";

import type {
  CallingSetupResponse,
  CreateEmployeePayload,
  PhonePreviewResponse,
  PhoneProvisionResponse,
  WazoCollection,
  WazoEmployee,
} from "./types";

function tenantBase(tenantUuid: string) {
  return `/tenants/${encodeURIComponent(tenantUuid)}`;
}

export const employeesApi = {
  async list(
    tenantUuid: string
  ): Promise<WazoCollection<WazoEmployee>> {
    const { data } = await apiClient.get<
      WazoCollection<WazoEmployee>
    >(`${tenantBase(tenantUuid)}/users`);

    return data;
  },

  async create(
    tenantUuid: string,
    payload: CreateEmployeePayload
  ): Promise<WazoEmployee> {
    const { data } = await apiClient.post<WazoEmployee>(
      `${tenantBase(tenantUuid)}/users`,
      payload
    );

    return data;
  },

  async getCallingSetup(
    tenantUuid: string
  ): Promise<CallingSetupResponse> {
    const { data } =
      await apiClient.get<CallingSetupResponse>(
        `${tenantBase(tenantUuid)}/calling-setup`
      );

    return data;
  },

  async previewPhone(
    tenantUuid: string,
    userId: number,
    extension: string
  ): Promise<PhonePreviewResponse> {
    const { data } =
      await apiClient.post<PhonePreviewResponse>(
        `${tenantBase(tenantUuid)}/users/${userId}/phone-setup/preview`,
        { extension }
      );

    return data;
  },

  async provisionPhone(
    tenantUuid: string,
    userId: number,
    extension: string
  ): Promise<PhoneProvisionResponse> {
    const { data } =
      await apiClient.post<PhoneProvisionResponse>(
        `${tenantBase(tenantUuid)}/users/${userId}/phone-setup`,
        { extension }
      );

    return data;
  },
};
