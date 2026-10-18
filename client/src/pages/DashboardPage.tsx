import { Link } from "react-router-dom";
import {
  ArrowRight, Building2, CheckCircle2, Clock3, Headset, Network,
  PhoneIncoming, Server, ShieldCheck, Users, Volume2, Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CurrentUserResponse } from "../features/auth/types";
import { useQuery } from "@tanstack/react-query";
import { companiesApi } from "../features/companies/companies.api";

interface Props { account: CurrentUserResponse }

type Tile = { name: string; description: string; icon: LucideIcon; href?: string };

const ownerTiles: Tile[] = [
  { name: "Companies", description: "Registered businesses, provisioning and approvals", icon: Building2, href: "/admin/approvals" },
  { name: "Platform users", description: "Customer accounts and memberships", icon: Users },
  { name: "Departments", description: "Review company queues and teams", icon: Network , href: "/company/departments" },
  { name: "IVR builder", description: "Call menu configuration", icon: Workflow },
  { name: "Phone numbers", description: "Incoming DID allocation", icon: PhoneIncoming },
  { name: "SIP trunks", description: "Carrier and telephony infrastructure", icon: Server },
];

const companyTiles: Tile[] = [
  { name: "Employees", description: "Create employees and provision SIP extensions", icon: Users, href: "/company/employees" },
  { name: "Departments", description: "Create queues and assign your team", icon: Network , href: "/company/departments"},
  { name: "Greetings & audio", description: "Upload welcome messages and recordings", icon: Volume2 },
  { name: "IVR builder", description: "Connect callers to the right department", icon: Workflow },
  { name: "Phone numbers", description: "Configure incoming calls and routing", icon: PhoneIncoming },
];

function TileCard({ tile, enabled }: { tile: Tile; enabled: boolean }) {
  const contents = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cream text-primary">
          <tile.icon size={24} />
        </div>
        {enabled ? <ArrowRight size={19} className="text-primary" /> : <span className="text-xs font-medium text-muted">Coming soon</span>}
      </div>
      <h3 className="mt-6 text-lg font-bold text-primary">{tile.name}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{tile.description}</p>
    </>
  );
  const style = "block rounded-2xl border border-border bg-white p-6 transition hover:border-primary/30 hover:shadow-sm";
  return enabled && tile.href ? (
    <Link to={tile.href} className={style}>{contents}</Link>
  ) : (
    <div className={style}>{contents}</div>
  );
}

export default function DashboardPage({ account }: Props) {
  const owner = account.user.platformRole === "PLATFORM_ADMIN";
  const companiesQuery = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    enabled: !owner,
  });
  const companies = companiesQuery.data || [];
  const activeCompany = companies.find((c) => c.status === "ACTIVE");
  const pendingCompany = companies.find((c) => c.status === "PENDING" || c.status === "PROVISIONING");
  const tiles = owner ? ownerTiles : companyTiles;

  return (
      <div className="space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-cream px-3 py-1.5 text-xs font-semibold text-primary">
              {owner ? <ShieldCheck size={14} /> : <Headset size={14} />}
              {owner ? "Platform administration" : "Company workspace"}
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
              Welcome back, {account.user.name}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {owner
                ? "Review your SaaS platform and manage registered companies."
                : "Manage your contact center in one workspace."}
            </p>
          </div>
          <p className="text-sm text-muted">Signed in as {account.user.email}</p>
        </div>

        {!owner && !companiesQuery.isLoading && (
          <section className="rounded-2xl border border-border bg-white p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cream text-primary">
                {activeCompany ? <CheckCircle2 size={23} /> : pendingCompany ? <Clock3 size={23} /> : <Building2 size={23} />}
              </span>
              <div>
                <h3 className="text-lg font-bold text-primary">
                  {activeCompany ? activeCompany.name : pendingCompany ? pendingCompany.name : "Set up your company"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {activeCompany
                    ? "Your company is active. You can manage employees and provision their SIP phones."
                    : pendingCompany
                      ? `Your company registration is ${pendingCompany.status.toLowerCase()}. Wazo management will become available after activation.`
                      : companies.length > 0
                        ? "Your company isn't active yet. Check the application status before using telephony features."
                        : "Your account is ready. Submit a company application to begin provisioning your contact center."}
                </p>
                {!activeCompany && (
                  <Link to="/company" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    {pendingCompany || companies.length > 0 ? "View application status" : "Register company"} <ArrowRight size={16} />
                  </Link>
                )}
                {activeCompany && (
                  <Link to="/company/employees" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    Manage employees <ArrowRight size={16} />
                  </Link>
                )}
              
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-primary">{owner ? "Platform management" : "Contact center tools"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {owner ? "Central control of your SaaS infrastructure." : "Tools for your company's daily operations."}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((tile) => (
              <TileCard key={tile.name} tile={tile} enabled={Boolean(tile.href && (owner || activeCompany))} />
            ))}
          </div>
        </section>
      </div>
  );
}
