import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Clock3, AlertCircle, Loader2, ArrowRight, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../../api/client";
import { companiesApi } from "../companies.api";

const statusText: Record<string, string> = {
  PENDING: "Awaiting review",
  PROVISIONING: "Configuring contact center",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REJECTED: "Application rejected",
  FAILED_PROVISIONING: "Provisioning needs review",
};

export default function CompanyPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const companies = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
    refetchOnWindowFocus: true,
  });

  const apply = useMutation({
    mutationFn: companiesApi.apply,
    onSuccess: async () => {
      setName("");
      setEmail("");
      setPhone("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["account", "companies"] }),
        client.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]);
    },
  });

  const records = companies.data || [];
  // Backend's current policy allows only one application per requester.
  const canApply = !companies.isPending && !companies.isError && records.length === 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canApply || apply.isPending) return;
    apply.mutate({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full bg-cream px-3 py-1 text-xs font-semibold text-primary">COMPANY WORKSPACE</span>
          <h2 className="mt-3 text-3xl font-bold text-primary">My company</h2>
          <p className="mt-2 text-sm text-muted-foreground">Register your business and track Wazo contact center activation.</p>
        </div>
        <button onClick={() => void companies.refetch()} disabled={companies.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-primary hover:bg-cream disabled:opacity-50">
          <RefreshCcw size={16} className={companies.isFetching ? "animate-spin" : ""} /> Refresh status
        </button>
      </div>

      {companies.isPending && <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-6 text-muted"><Loader2 className="animate-spin" size={18}/> Loading company details...</div>}
      {companies.isError && <div role="alert" className="rounded-xl bg-danger/10 p-4 text-danger">{getApiErrorMessage(companies.error)}</div>}

      {records.map((company) => {
        const active = company.status === "ACTIVE" && Boolean(company.wazoTenantUuid);
        return (
          <section key={company.id} className="rounded-2xl border border-border bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-cream p-3 text-primary"><Building2 size={26}/></div>
                <div>
                  <h3 className="text-xl font-bold text-primary">{company.name}</h3>
                  <p className="mt-1 text-sm text-muted">{company.email || "No company email"}</p>
                  <p className="text-sm text-muted">{company.phone || "No phone number"}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-green-50 text-green-800" : "bg-cream text-primary"}`}>
                {statusText[company.status] || company.status}
              </span>
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-page p-4">
              {active ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-700" /> : company.status === "PENDING" || company.status === "PROVISIONING" ? <Clock3 size={20} className="mt-0.5 shrink-0 text-primary" /> : <AlertCircle size={20} className="mt-0.5 shrink-0 text-danger" />}
              <div className="text-sm leading-6 text-muted-foreground">
                {active ? "Your company is active. You can now manage employees, SIP extensions and other contact center features." : company.status === "PENDING" ? "Your application is waiting for platform administrator approval. Calling resources have not been created yet." : company.status === "PROVISIONING" ? "Your application was approved. Wazo tenant and calling contexts are being configured." : company.status === "REJECTED" ? "Your company application was rejected. Contact the platform administrator for next steps." : company.status === "SUSPENDED" ? "Your company is suspended. Contact the platform administrator for assistance." : "Your company's activation needs administrator review. Do not submit a duplicate company application."}
              </div>
            </div>
            {active && <Link to="/company/employees" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90">Manage employees <ArrowRight size={17}/></Link>}
            {active && <p className="mt-4 break-all text-xs text-muted">Wazo tenant: {company.wazoTenantUuid}</p>}
          </section>
        );
      })}

      {canApply && (
        <section className="rounded-2xl border border-border bg-white p-6 sm:p-8">
          <h3 className="text-xl font-bold text-primary">Register your company</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Submit one company application. The platform administrator will review it before provisioning your Wazo tenant.</p>
          <form onSubmit={submit} className="mt-6 max-w-2xl space-y-5">
            <div><label htmlFor="company-name" className="mb-2 block text-sm font-semibold text-primary">Company name *</label><input id="company-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Example Contact Center" className="w-full rounded-xl border border-border bg-white px-4 py-3 text-primary outline-none focus:border-primary"/></div>
            <div><label htmlFor="company-email" className="mb-2 block text-sm font-semibold text-primary">Company email (optional)</label><input id="company-email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@company.com" className="w-full rounded-xl border border-border bg-white px-4 py-3 text-primary outline-none focus:border-primary"/></div>
            <div><label htmlFor="company-phone" className="mb-2 block text-sm font-semibold text-primary">Phone number (optional)</label><input id="company-phone" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966500000000" className="w-full rounded-xl border border-border bg-white px-4 py-3 text-primary outline-none focus:border-primary"/></div>
            {apply.isError && <div role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">{getApiErrorMessage(apply.error)}</div>}
            <button disabled={apply.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white hover:bg-primary/90 disabled:opacity-60" type="submit">{apply.isPending && <Loader2 size={17} className="animate-spin"/>}{apply.isPending ? "Submitting..." : "Submit for approval"}</button>
          </form>
        </section>
      )}
    </div>
  );
}
