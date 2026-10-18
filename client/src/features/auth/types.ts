
export type PlatformRole = "USER" | "PLATFORM_ADMIN";

export type OrganizationRole =
  | "COMPANY_ADMIN"
  | "SUPERVISOR"
  | "AGENT";

export type OrganizationStatus =
  | "PENDING"
  | "PROVISIONING"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | "FAILED_PROVISIONING";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  isActive: boolean;
  emailVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  role: OrganizationRole;
  organization: {
    id: string;
    name: string;
    wazoTenantUuid: string | null;
    status?: OrganizationStatus;
  } | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user: AuthUser;
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  user: AuthUser;
  emailVerificationRequired: boolean;
}

export interface CurrentUserResponse {
  success: boolean;
  user: AuthUser;
  memberships: Membership[];
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
}
