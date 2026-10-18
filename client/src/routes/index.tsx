import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { authApi } from "../features/auth/api/auth.api";
import LoginPage from "../features/auth/pages/LoginPage";
import RegisterPage from "../features/auth/pages/RegisterPage";
import WorkspaceLayout from "../layouts/WorkspaceLayout";
import DashboardPage from "../pages/DashboardPage";
import EmployeesPage from "../features/employee/EmployeesPage";
import CompanyPage from "../features/companies/pages/CompanyPage";
import CompanyApprovalsPage from "../features/companies/pages/CompanyApprovalsPage";
import { companiesApi } from "../features/companies/companies.api";
import type { CurrentUserResponse } from "../features/auth/types";
import DepartmentsPage from "../features/departments/pages/DepartmentsPage";
import GreetingsPage from "../features/greetings/pages/GreetingsPage";
import IvrPage from "../features/ivr/pages/IvrPage";

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-page"><Loader2 size={32} className="animate-spin text-primary" /></div>;
}

function useCurrentAccount() {
  return useQuery({ queryKey: ["auth", "me"], queryFn: authApi.me, retry: false, staleTime: 60_000 });
}

function ProtectedLayout() {
  const query = useCurrentAccount();
  if (query.isPending) return <LoadingScreen />;
  if (!query.data?.user.isActive) return <Navigate to="/login" replace />;
  return <Outlet context={query.data} />;
}

function WorkspaceRoute() {
  const account = useOutletContext<CurrentUserResponse>();
  return <WorkspaceLayout account={account}><Outlet context={account} /></WorkspaceLayout>;
}

function DashboardRoute() {
  const account = useOutletContext<CurrentUserResponse>();
  return <DashboardPage account={account} />;
}

function CompanyRoute() {
  const account = useOutletContext<CurrentUserResponse>();
  if (account.user.platformRole === "PLATFORM_ADMIN") return <Navigate to="/admin/approvals" replace />;
  return <CompanyPage />;
}

function AdminApprovalsRoute() {
  const account = useOutletContext<CurrentUserResponse>();
  if (account.user.platformRole !== "PLATFORM_ADMIN") return <Navigate to="/dashboard" replace />;
  return <CompanyApprovalsPage />;
}

function EmployeesRoute() {
  const account = useOutletContext<CurrentUserResponse>();
  const isOwner = account.user.platformRole === "PLATFORM_ADMIN";
  const companies = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    enabled: !isOwner,
    staleTime: 30_000,
  });
  if (isOwner) return <Navigate to="/dashboard" replace />;
  if (companies.isPending) return <LoadingScreen />;
  if (companies.isError) return <div role="alert" className="rounded-xl bg-danger/10 p-4 text-danger">Unable to verify company access. Please refresh and try again.</div>;
  const allowed = companies.data.some((company) =>
    company.status === "ACTIVE" && Boolean(company.wazoTenantUuid) &&
    company.memberships.some((member) => member.role === "COMPANY_ADMIN" || member.role === "SUPERVISOR")
  );
  if (!allowed) return <Navigate to="/company" replace />;
  return <EmployeesPage />;
}

function GuestRoute({ children }: { children: ReactNode }) {
  const query = useCurrentAccount();
  if (query.isPending) return <LoadingScreen />;
  if (query.data?.user.isActive) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}


function DepartmentsRoute() {
  const account = useOutletContext<CurrentUserResponse>();

  const isPlatformAdmin =
    account.user.platformRole === "PLATFORM_ADMIN";

  const companies = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    enabled: !isPlatformAdmin,
    staleTime: 30_000,
  });

  if (isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (companies.isPending) {
    return <LoadingScreen />;
  }

  if (companies.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl bg-danger/10 p-4 text-danger"
      >
        Unable to verify company access.
        Please refresh and try again.
      </div>
    );
  }

  const hasAccess = (companies.data ?? []).some(
    (company) =>
      company.status === "ACTIVE" &&
      Boolean(company.wazoTenantUuid) &&
      company.memberships.some(
        (member) =>
          member.role === "COMPANY_ADMIN" ||
          member.role === "SUPERVISOR"
      )
  );

  if (!hasAccess) {
    return <Navigate to="/company" replace />;
  }

  return <DepartmentsPage />;
}


function GreetingsRoute() {
  const account = useOutletContext<CurrentUserResponse>();

  const isPlatformAdmin =
    account.user.platformRole === "PLATFORM_ADMIN";

  const companies = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    enabled: !isPlatformAdmin,
    staleTime: 30_000,
  });

  if (isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (companies.isPending) {
    return <LoadingScreen />;
  }

  if (companies.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl bg-danger-background p-4 text-danger"
      >
        Unable to verify company access.
      </div>
    );
  }

  const hasAccess = (companies.data ?? []).some(
    (company) =>
      company.status === "ACTIVE" &&
      Boolean(company.wazoTenantUuid) &&
      company.memberships.some(
        (member) =>
          member.role === "COMPANY_ADMIN" ||
          member.role === "SUPERVISOR"
      )
  );

  if (!hasAccess) {
    return <Navigate to="/company" replace />;
  }

  return <GreetingsPage />;
}


function IvrRoute() {
  const account = useOutletContext<CurrentUserResponse>();

  const isPlatformAdmin =
    account.user.platformRole === "PLATFORM_ADMIN";

  const companies = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    enabled: !isPlatformAdmin,
    staleTime: 30_000,
  });

  if (isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (companies.isPending) {
    return <LoadingScreen />;
  }

  if (companies.isError) {
    return (
      <div role="alert" className="rounded-xl bg-danger-background p-4 text-danger">
        Unable to verify company access.
      </div>
    );
  }

  const allowed = (companies.data ?? []).some(
    (company) =>
      company.status === "ACTIVE" &&
      Boolean(company.wazoTenantUuid) &&
      company.memberships.some(
        (membership) =>
          membership.role === "COMPANY_ADMIN" ||
          membership.role === "SUPERVISOR"
      )
  );

  return allowed
    ? <IvrPage />
    : <Navigate to="/company" replace />;
}




export default function AppRoutes() {
  return <Routes>
    <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
    <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
    <Route element={<ProtectedLayout />}>
      <Route element={<WorkspaceRoute />}>
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/company" element={<CompanyRoute />} />
        <Route path="/company/employees" element={<EmployeesRoute />} />
        <Route path="/admin/approvals" element={<AdminApprovalsRoute />} />
        <Route path="/company/departments" element={<DepartmentsRoute />}/>
        <Route path="/company/greetings" element={<GreetingsRoute />}/>
        <Route path="/company/ivr" element={<IvrRoute />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
