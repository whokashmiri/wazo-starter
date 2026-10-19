export interface WaDepartment { id: string; channelId: string; code: string; name: string; externalDepartmentId: string; enabled: boolean; }
export interface WaMember { id: string; wazoUserId: number; departmentCode: string | null; phone: string; optedIn: boolean; enabled: boolean; }
export interface WaChannel { id: string; phoneNumberId: string; wabaId: string; displayNumber: string | null; enabled: boolean; departments: WaDepartment[]; members: WaMember[]; }
export interface WaConversation { id: string; channelId: string; customerPhone: string; departmentCode: string | null; status: string; assignedWazoUserId: number | null; createdAt: string; updatedAt: string; lastMessage?: string | null; }
export interface WaConversationPage { items: WaConversation[]; total: number; page: number; pageSize: number; }

// Uses existing cookie-based SaaS authentication. Do not put the Meta token in localStorage.
// Set VITE_API_BASE_URL to the API origin when frontend and backend are on separate hosts.
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class WhatsAppApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'WhatsAppApiError'; }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const raw = await response.text();
  let result: unknown;
  try { result = raw ? JSON.parse(raw) : null; } catch { result = null; }
  if (!response.ok) {
    const message = result && typeof result === 'object' ?
      String((result as { error?: string; message?: string }).error || (result as { message?: string }).message || `Request failed (${response.status})`) :
      `Request failed (${response.status})`;
    throw new WhatsAppApiError(message, response.status);
  }
  return result as T;
}
const path = (org: string) => `/api/organizations/${encodeURIComponent(org)}/whatsapp`;
export const whatsappApi = {
  listChannels: (organizationId: string) => call<WaChannel[]>(path(organizationId)),
  connect: (organizationId: string, data: { phoneNumberId: string; wabaId: string; accessToken: string; displayNumber?: string; }) =>
    call<{ id: string; phoneNumberId: string; wabaId: string; enabled: boolean }>(`${path(organizationId)}/connect`, { method: 'POST', body: JSON.stringify(data) }),
  registerDepartment: (organizationId: string, data: { channelId: string; externalDepartmentId: string; code: string; }) =>
    call<WaDepartment>(`${path(organizationId)}/department`, { method: 'POST', body: JSON.stringify(data) }),
  registerMember: (organizationId: string, data: { channelId: string; wazoUserId: number; departmentCode: string | null; personalWhatsApp: string; optedIn: boolean; }) =>
    call<WaMember>(`${path(organizationId)}/member`, { method: 'POST', body: JSON.stringify(data) }),
  // Optional read-only backend extension documented in the package.
  listConversations: (organizationId: string, channelId: string, page = 1) =>
    call<WaConversationPage>(`${path(organizationId)}/conversations?channelId=${encodeURIComponent(channelId)}&page=${page}`),
};
