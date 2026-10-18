import { apiClient } from "../../api/client";
import type { OrganizationRole, OrganizationStatus } from "../auth/types";

export interface CustomerCompany {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string;
  status: OrganizationStatus;
  wazoTenantUuid: string | null;
  createdAt: string;
  memberships: Array<{ role: OrganizationRole }>;
}

export interface CompanyApplicationPayload {
  name: string;
  email?: string;
  phone?: string;
}

export interface AdminCompany {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string;
  status: OrganizationStatus;
  wazoTenantUuid: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  provisioningError: string | null;
  requestedBy: { id: string; name: string; email: string } | null;
  reviewedBy: { id: string; name: string; email: string } | null;
  memberships: Array<{
    role: OrganizationRole;
    user: { id: string; name: string; email: string; isActive: boolean };
  }>;
}

export const companiesApi = {
  async listMine(): Promise<CustomerCompany[]> {
    const { data } = await apiClient.get<{ success: boolean; organizations: CustomerCompany[] }>("/account/companies");
    return data.organizations;
  },

  async apply(payload: CompanyApplicationPayload): Promise<CustomerCompany> {
    const { data } = await apiClient.post<{ success: boolean; organization: CustomerCompany }>("/account/companies", payload);
    return data.organization;
  },

  async listAll(status?: OrganizationStatus): Promise<AdminCompany[]> {
    const { data } = await apiClient.get<{ success: boolean; companies: AdminCompany[] }>("/admin/companies", {
      params: status ? { status } : undefined,
    });
    return data.companies;
  },

  async approve(id: string): Promise<void> {
    await apiClient.post(`/admin/companies/${encodeURIComponent(id)}/approve`);
  },

  async reject(id: string, reason: string): Promise<void> {
    await apiClient.post(`/admin/companies/${encodeURIComponent(id)}/reject`, { reason });
  },
};
