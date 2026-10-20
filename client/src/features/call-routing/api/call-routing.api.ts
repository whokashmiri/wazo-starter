import { apiClient } from '../../../api/client';

export interface IvrSummary {
  id: number;
  tenantUuid: string;
  name: string;
  menuSound: string | null;
  choices: Array<{ digit: string; destination: unknown }>;
}

export interface InternalIvrRoute {
  tenantUuid: string;
  ivrId: number;
  extension: string;
  context: string;
  destination: string;
  active: boolean;
}

export interface LocalDidRoute {
  did: string;
  contextId: number;
  contextName: string;
  extensionId: number;
  incallId: number;
  destination: {
    type?: string;
    ivr_id?: number;
  };
  configured: boolean;
  carrierConnected: boolean;
}

interface ItemsResponse<T> {
  items: T[];
  total: number;
  tenantUuid: string;
}

export const callRoutingApi = {
  async listIvrs(tenantUuid: string): Promise<IvrSummary[]> {
    const { data } = await apiClient.get<ItemsResponse<IvrSummary>>(
      `/tenants/${tenantUuid}/ivrs`
    );
    if (!Array.isArray(data?.items)) throw new Error('Invalid IVR list response');
    return data.items;
  },

  async listInternal(tenantUuid: string, ivrId: number): Promise<InternalIvrRoute[]> {
    const { data } = await apiClient.get<ItemsResponse<InternalIvrRoute>>(
      `/tenants/${tenantUuid}/ivrs/${ivrId}/internal-route`
    );
    if (!Array.isArray(data?.items)) throw new Error('Invalid internal routes response');
    return data.items;
  },

  async addInternal(tenantUuid: string, ivrId: number, extension: string) {
    const { data } = await apiClient.post<{
      success: boolean;
      created: boolean;
      route: InternalIvrRoute;
    }>(`/tenants/${tenantUuid}/ivrs/${ivrId}/internal-route`, { extension });
    return data;
  },

  async removeInternal(tenantUuid: string, ivrId: number) {
    const { data } = await apiClient.delete<{
      success: boolean;
      deleted: boolean;
    }>(`/tenants/${tenantUuid}/ivrs/${ivrId}/internal-route`);
    return data;
  },

  async listLocalDids(tenantUuid: string): Promise<LocalDidRoute[]> {
    const { data } = await apiClient.get<ItemsResponse<LocalDidRoute>>(
      `/tenants/${tenantUuid}/phone-numbers`
    );
    if (!Array.isArray(data?.items)) throw new Error('Invalid local DID response');
    return data.items;
  },

  async createLocalDid(tenantUuid: string, did: string, ivrId: number) {
    const { data } = await apiClient.post<{
      success: boolean;
      created: boolean;
      route: LocalDidRoute;
    }>(`/tenants/${tenantUuid}/phone-numbers`, { did, ivrId });
    return data;
  },

  async activateLocalDid(tenantUuid: string, incallId: number) {
    const { data } = await apiClient.post<{
      success: boolean;
      route: LocalDidRoute;
    }>(`/tenants/${tenantUuid}/phone-numbers/${incallId}/activate`, {});
    return data;
  },
};
