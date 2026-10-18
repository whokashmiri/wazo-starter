import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Building2, ChevronDown, ChevronRight, Headset, LayoutDashboard,
  LogOut, Menu, Network, PhoneIncoming, Server, Settings2, ShieldCheck,
  Users, Volume2, Workflow, X, type LucideIcon,
} from "lucide-react";
import { authApi } from "../features/auth/api/auth.api";
import { companiesApi } from "../features/companies/companies.api";
import { getApiErrorMessage } from "../api/client";
import type { CurrentUserResponse } from "../features/auth/types";

type NavEntry = { label: string; icon: LucideIcon; to?: string; section?: string };

const platformItems: NavEntry[] = [
  { label: "Overview", icon: LayoutDashboard, to: "/dashboard", section: "PLATFORM" },
  { label: "Companies", icon: Building2, to: "/admin/approvals" },
  { label: "Platform users", icon: Users },
  { label: "Approvals", icon: ShieldCheck, to: "/admin/approvals" },
  { label: "Phone numbers", icon: PhoneIncoming, section: "TELEPHONY" },
  { label: "SIP trunks", icon: Server },
  { label: "Settings", icon: Settings2, section: "ACCOUNT" },
];

const companyItems: NavEntry[] = [
  { label: "Overview", icon: LayoutDashboard, to: "/dashboard", section: "WORKSPACE" },
  { label: "My company", icon: Building2, to: "/company" },
  { label: "Employees", icon: Users, to: "/company/employees" },
  { label: "Departments", icon: Network, to: "/company/departments" },
  { label: "Greetings & audio", icon: Volume2, section: "CALL MANAGEMENT" , to: "/company/greetings"},
  { label: "IVR builder", icon: Workflow  , to: "/company/ivr",},
  { label: "Call routing", icon: Activity },
  { label: "Phone numbers", icon: PhoneIncoming },
  { label: "Company settings", icon: Settings2, section: "SETTINGS" },
];

function Navigation({ items, close }: { items: NavEntry[]; close: () => void }) {
  return (
    <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-5">
      {items.map(({ label, icon: Icon, to, section }) => (
        <div key={label}>
          {section && (
            <p className="mb-2 mt-6 px-3 text-[10px] font-bold tracking-[0.16em] text-white/45 first:mt-0">
              {section}
            </p>
          )}
          {to ? (
            <NavLink
              to={to}
              end={to === "/dashboard"}
              onClick={close}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-warm text-primary shadow-sm"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={15} className="opacity-50" aria-hidden="true" />
            </NavLink>
          ) : (
            <div
              title="Feature UI coming soon"
              aria-disabled="true"
              className="mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/40"
            >
              <Icon size={19} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              <span className="text-[10px]">Soon</span>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export default function WorkspaceLayout({
  account,
  children,
}: {
  account: CurrentUserResponse;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isPlatformAdmin = account.user.platformRole === "PLATFORM_ADMIN";

  const companyQuery = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    enabled: !isPlatformAdmin,
    staleTime: 30_000,
  });

  const companies = companyQuery.data || [];
  const company = companies.find((item) => item.status === "ACTIVE") || companies[0];
  const companyName = isPlatformAdmin
    ? "Platform Administration"
    : company?.name || account.memberships[0]?.organization?.name || "No company yet";
  const companyStatus = company?.status || "NO_COMPANY";

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
    onError: (error) => setLogoutError(getApiErrorMessage(error)),
  });

  return (
    <div className="min-h-screen bg-page text-primary lg:flex">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-primary/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-66.25 flex-col bg-primary text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-19 items-center justify-between border-b border-white/10 px-5">
          <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warm text-primary">
              <Headset size={22} />
            </span>
            <span className="text-sm font-bold leading-5">
              Contact Center<br />Cloud
            </span>
          </Link>
          <button className="rounded-lg p-1 text-white/80 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={21} />
          </button>
        </div>

        <div className="mx-3 mt-5 rounded-xl border border-white/15 bg-white/5 px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
              {isPlatformAdmin ? <ShieldCheck size={20} /> : <Building2 size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{companyName}</p>
              <p className="mt-0.5 text-xs text-white/55">
                {isPlatformAdmin ? "Platform owner" : company?.status || "Customer account"}
              </p>
            </div>
          </div>
        </div>

        <Navigation items={isPlatformAdmin ? platformItems : companyItems} close={() => setMobileOpen(false)} />

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warm font-bold text-primary">
              {account.user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{account.user.name}</p>
              <p className="truncate text-xs text-white/55">{account.user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-19 items-center justify-between gap-4 border-b border-border bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              className="rounded-lg border border-border p-2.5 text-primary lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                {isPlatformAdmin ? "Platform workspace" : "Company workspace"}
              </p>
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold text-primary sm:text-lg">{companyName}</h1>
                {!isPlatformAdmin && company && (
                  <span className={`hidden rounded-full px-2 py-1 text-[10px] font-semibold sm:inline-flex ${
                    companyStatus === "ACTIVE"
                      ? "bg-success-background text-success"
                      : "bg-cream text-primary"
                  }`}>
                    {companyStatus}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
              className="flex items-center gap-2 rounded-xl border border-border px-2 py-2 text-primary hover:bg-page sm:px-3"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream text-sm font-bold">
                {account.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">{account.user.name}</span>
              <ChevronDown size={15} className="text-muted" />
            </button>
            {accountOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-white p-2 shadow-lg">
                <p className="truncate px-3 py-2 text-xs text-muted">{account.user.email}</p>
                <button
                  type="button"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger-background disabled:opacity-60"
                >
                  <LogOut size={17} /> {logout.isPending ? "Signing out..." : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-375 px-4 py-7 sm:px-7 sm:py-9">
          {logoutError && <div role="alert" className="mb-5 rounded-xl bg-danger-background p-4 text-sm text-danger">{logoutError}</div>}
          {!isPlatformAdmin && companyQuery.isError && (
            <div role="alert" className="mb-5 rounded-xl bg-danger-background p-4 text-sm text-danger">
              Unable to load company details: {getApiErrorMessage(companyQuery.error)}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
