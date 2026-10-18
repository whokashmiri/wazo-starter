import { apiClient } from '../../../api/client';

export interface IvrChoice {
  digit: string;
  destination: { type?: string; queue_id?: number; [key: string]: unknown };
}
export interface IvrItem {
  id: number;
  tenantUuid: string;
  name: string;
  description?: string | null;
  greetingSound?: string | null;
  menuSound: string;
  timeout: number;
  maxTries: number;
  choices: IvrChoice[];
}
export interface DepartmentOption {
  id: number;
  name: string;
  queueId?: number;
  tenantUuid?: string;
  members?: { users?: unknown[] };
}
export interface IvrInternalRoute {
  tenantUuid: string;
  ivrId: number;
  extension: string;
  context: string;
  destination: string;
  active?: boolean;
}
export interface CreateIvrPayload {
  name: string;
  description?: string;
  menuSound: string;
  timeout: number;
  maxTries: number;
  choices: { digit: string; queueId: number }[];
}

function asItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
    return data.items as T[];
  }
  return [];
}

export const ivrApi = {
  async list(tenant: string): Promise<IvrItem[]> {
    const { data } = await apiClient.get(`/tenants/${tenant}/ivrs`);
    return asItems<IvrItem>(data);
  },
  async departments(tenant: string): Promise<DepartmentOption[]> {
    const { data } = await apiClient.get(`/tenants/${tenant}/departments`);
    return asItems<DepartmentOption>(data);
  },
  async create(tenant: string, payload: CreateIvrPayload): Promise<IvrItem> {
    const { data } = await apiClient.post<{ success: boolean; ivr: IvrItem }>(`/tenants/${tenant}/ivrs`, payload);
    return data.ivr;
  },
  async listRoutes(tenant: string, ivrId: number): Promise<IvrInternalRoute[]> {
    const { data } = await apiClient.get(`/tenants/${tenant}/ivrs/${ivrId}/internal-route`);
    return asItems<IvrInternalRoute>(data);
  },
  async addRoute(tenant: string, ivrId: number, extension: string): Promise<IvrInternalRoute> {
    const { data } = await apiClient.post<{ route: IvrInternalRoute }>(
      `/tenants/${tenant}/ivrs/${ivrId}/internal-route`, { extension }
    );
    return data.route;
  },
  async removeRoutes(tenant: string, ivrId: number): Promise<void> {
    await apiClient.delete(`/tenants/${tenant}/ivrs/${ivrId}/internal-route`);
  },
};
