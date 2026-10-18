import { apiClient } from "../../../api/client";

export type CompanyStatus =
  | "PENDING" | "PROVISIONING" | "ACTIVE" | "SUSPENDED"
  | "REJECTED" | "FAILED_PROVISIONING";

export interface MyCompany {
  id: string;
  name: string;
  status: CompanyStatus;
  wazoTenantUuid: string | null;
  memberships: Array<{ role: "COMPANY_ADMIN" | "SUPERVISOR" | "AGENT" }>;
}

export interface QueueMember {
  id?: number;
  uuid?: string;
  firstname?: string;
  lastname?: string;
  name?: string;
}

export interface Department {
  id: number;
  queueId: number;
  tenantUuid: string;
  name: string;
  queueName: string;
  strategy: string | null;
  members: { users: QueueMember[]; agents: QueueMember[] };
  // Wazo get() can contain queue extensions, if toDepartment maps them.
  extensions?: Array<{ id: number; exten: string; context: string }>;
}

export interface Employee {
  id: number;
  uuid?: string;
  firstname: string;
  lastname?: string | null;
  enabled?: boolean;
  lines?: Array<{ id: number }>;
}

export interface ExtensionResult {
  success: boolean;
  created: boolean;
  message: string;
  extension: string;
  context: string;
}

const scoped = (uuid: string) => `/tenants/${encodeURIComponent(uuid)}`;

export const departmentsApi = {
  async companies(): Promise<MyCompany[]> {
    const { data } = await apiClient.get<{ organizations: MyCompany[] }>("/account/companies");
    return data.organizations;
  },
  async list(uuid: string): Promise<Department[]> {
    const { data } = await apiClient.get<{ items: Department[] }>(`${scoped(uuid)}/departments`);
    return data.items;
  },
  async get(uuid: string, queueId: number): Promise<Department> {
    const { data } = await apiClient.get<Department>(`${scoped(uuid)}/departments/${queueId}`);
    return data;
  },
  async create(uuid: string, payload: { name: string; strategy: string }): Promise<Department> {
    const { data } = await apiClient.post<{ department: Department }>(`${scoped(uuid)}/departments`, payload);
    return data.department;
  },
  async employees(uuid: string): Promise<Employee[]> {
    const { data } = await apiClient.get<{ items: Employee[] }>(`${scoped(uuid)}/users`);
    return data.items;
  },
  async addMember(uuid: string, queueId: number, userId: number): Promise<void> {
    await apiClient.post(`${scoped(uuid)}/departments/${queueId}/members`, { userId });
  },
  async setupExtension(uuid: string, queueId: number, extension: string): Promise<ExtensionResult> {
    const { data } = await apiClient.post<ExtensionResult>(
      `${scoped(uuid)}/departments/${queueId}/extension`, { extension }
    );
    return data;
  },
};
