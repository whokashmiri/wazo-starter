
export interface WazoEmployee {
  id: number;
  uuid?: string;
  firstname: string;
  lastname?: string | null;
  enabled?: boolean;
  tenant_uuid?: string;
  lines?: Array<{
    id: number;
    name?: string;
    extensions?: Array<{
      id: number;
      exten: string;
    }>;
  }>;
}

export interface WazoCollection<T> {
  items: T[];
  total?: number;
}

export interface CreateEmployeePayload {
  firstname: string;
  lastname: string;
}

export interface WazoContext {
  id: number;
  name: string;
  label?: string;
  type: string;
  enabled: boolean;
  tenant_uuid: string;
  user_ranges?: Array<{
    start: string;
    end: string;
  }>;
}

export interface WazoExtension {
  id: number;
  exten: string;
  context: string;
  tenant_uuid?: string;
}

export interface CallingSetupResponse {
  tenantUuid: string;
  contexts: WazoCollection<WazoContext>;
  extensions: WazoCollection<WazoExtension>;
}

export interface PhonePreviewResponse {
  ready: boolean;
  message: string;
  tenantUuid: string;
  employee: {
    id: number;
    uuid?: string;
    name: string;
  };
  extension: string;
  context: {
    id: number;
    name: string;
    label?: string;
  };
  nextStep: string;
}

export interface PhoneProvisionResponse {
  success: boolean;
  message: string;
  tenantUuid: string;
  employee: {
    id: number;
    name: string;
  };
  phone: {
    extension: string;
    context: string;
    lineId: number;
    extensionId: number;
    endpointId: string | number;
  };
  sipCredentials: {
    username: string;
    password: string;
    note: string;
  };
  asterisk?: unknown;
}
