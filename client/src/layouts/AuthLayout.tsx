
import type { ReactNode } from "react";
import {
  Headset,
  ShieldCheck,
  Building2,
  Users,
  Workflow,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";

interface AuthLayoutProps {
  children: ReactNode;
}

const features = [
  {
    icon: Building2,
    label: "Company management",
    description: "Manage your workspace",
  },
  {
    icon: Users,
    label: "Employees & departments",
    description: "Organize your team",
  },
  {
    icon: Workflow,
    label: "Call flows & IVR",
    description: "Customize customer journeys",
  },
];

export default function AuthLayout({
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-page lg:grid lg:grid-cols-2">
      {/* Left panel */}
      <aside className="relative hidden min-h-screen overflow-hidden bg-primary p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-32 h-96 w-96 rounded-full border-70 border-white/5"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-32 h-115 w-115 rounded-full bg-warm/10 blur-3xl"
        />

        <Link
          to="/login"
          className="relative z-10 flex w-fit items-center gap-3"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warm text-primary">
            <Headset size={25} strokeWidth={2.2} />
          </span>

          <span className="text-xl font-bold tracking-tight">
            Contact Center Cloud
          </span>
        </Link>

        <div className="relative z-10 max-w-xl py-16">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-warm">
            <span className="h-2 w-2 rounded-full bg-warm" />
            Your contact center workspace
          </span>

          <h1 className="max-w-lg text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Every customer conversation starts here.
          </h1>

          <p className="mt-6 max-w-lg text-base leading-8 text-white/70">
            Manage your team, organize departments, configure IVR
            menus, and build a better calling experience from one
            central platform.
          </p>

          <div className="mt-10 space-y-3">
            {features.map(({ icon: Icon, label, description }) => (
              <div
                key={label}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warm/15 text-warm">
                  <Icon size={21} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{label}</p>
                  <p className="text-sm text-white/55">
                    {description}
                  </p>
                </div>

                <ArrowUpRight
                  size={18}
                  className="text-white/35"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-sm text-white/60">
          <ShieldCheck size={18} className="text-warm" />
          Secure, company-based account access
        </div>
      </aside>

      {/* Right panel */}
      <main className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-6 lg:hidden">
          <Link
            to="/login"
            className="flex items-center gap-3 font-semibold text-primary"
          >
            <span className="rounded-xl bg-primary p-2 text-white">
              <Headset size={21} />
            </span>
            Contact Center Cloud
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10 lg:px-12">
          <div className="w-full max-w-110">
            {children}
          </div>
        </div>

        <footer className="px-6 py-5 text-center text-xs text-muted">
          Contact Center Cloud
        </footer>
      </main>
    </div>
  );
}
