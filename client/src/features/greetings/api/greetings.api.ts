import { apiClient } from '../../../api/client';

export interface GreetingAudio {
  id: string;
  tenantUuid: string;
  name: string;
  originalName: string;
  menuSound: string;
  createdAt: string;
}

export const greetingsApi = {
  async list(tenantUuid: string): Promise<GreetingAudio[]> {
    const { data } = await apiClient.get<{ items: GreetingAudio[] }>(
      `/tenants/${tenantUuid}/ivr/audio`
    );
    return Array.isArray(data.items) ? data.items : [];
  },
  async upload(tenantUuid: string, name: string, file: File): Promise<GreetingAudio> {
    const body = new FormData();
    body.append('name', name);
    body.append('file', file);
    const { data } = await apiClient.post<{ success: boolean; audio: GreetingAudio }>(
      `/tenants/${tenantUuid}/ivr/audio`, body
    );
    return data.audio;
  },
  async preview(tenantUuid: string, audioId: string): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(
      `/tenants/${tenantUuid}/ivr/audio/${audioId}/file`,
      { responseType: 'blob' }
    );
    return data;
  },
};
