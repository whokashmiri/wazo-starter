import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Clock3, Loader2, RefreshCcw, ShieldCheck, X } from "lucide-react";
import { getApiErrorMessage } from "../../../api/client";
import { companiesApi, type AdminCompany } from "../companies.api";
import type { OrganizationStatus } from "../../auth/types";

type Filter = "ALL" | OrganizationStatus;
const filters: Filter[] = ["PENDING", "ALL", "ACTIVE", "PROVISIONING", "FAILED_PROVISIONING", "REJECTED", "SUSPENDED"];
const statusLabels: Record<string, string> = {
  PENDING: "Pending", PROVISIONING: "Provisioning", ACTIVE: "Active",
  SUSPENDED: "Suspended", REJECTED: "Rejected", FAILED_PROVISIONING: "Needs review",
};

export default function CompanyApprovalsPage() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [rejecting, setRejecting] = useState<AdminCompany | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<AdminCompany | null>(null);
  const [feedback, setFeedback] = useState("");

  const query = useQuery({
    queryKey: ["admin", "companies", filter],
    queryFn: () => companiesApi.listAll(filter === "ALL" ? undefined : filter),
    refetchOnWindowFocus: true,
  });

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin", "companies"] }),
      client.invalidateQueries({ queryKey: ["account", "companies"] }),
      client.invalidateQueries({ queryKey: ["auth", "me"] }),
    ]);
  }

  const approve = useMutation({
    mutationFn: companiesApi.approve,
    onSuccess: async () => {
      setConfirming(null);
      setFeedback("Company approved and Wazo calling contexts provisioned.");
      await refresh();
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => companiesApi.reject(id, reason),
    onSuccess: async () => {
      setRejecting(null);
      setReason("");
      setFeedback("Company application rejected.");
      await refresh();
    },
  });

  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-cream px-3 py-1 text-xs font-semibold text-primary"><ShieldCheck size={14}/> PLATFORM ADMIN</span>
          <h2 className="mt-3 text-3xl font-bold text-primary">Company approvals</h2>
          <p className="mt-2 text-sm text-muted-foreground">Review applications. Approval creates a Wazo tenant and configures calling contexts.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={query.isFetching || busy} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-primary hover:bg-cream disabled:opacity-50"><RefreshCcw size={17} className={query.isFetching ? "animate-spin" : ""}/> Refresh</button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter company applications">
        {filters.map((item) => <button key={item} type="button" onClick={() => { setFilter(item); setFeedback(""); }} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${filter === item ? "bg-primary text-white" : "border border-border bg-white text-primary hover:bg-cream"}`}>{item === "ALL" ? "All companies" : statusLabels[item]}</button>)}
      </div>

      {feedback && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{feedback}</div>}
      {query.isPending && <div className="flex items-center gap-2 rounded-xl bg-white p-6 text-muted"><Loader2 size={19} className="animate-spin"/> Loading applications...</div>}
      {query.isError && <div role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">{getApiErrorMessage(query.error)}</div>}
      {approve.isError && <div role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">Approval failed: {getApiErrorMessage(approve.error)}. Check provisioning status before attempting any recovery; do not create another Wazo tenant blindly.</div>}
      {reject.isError && <div role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">{getApiErrorMessage(reject.error)}</div>}

      {query.data && query.data.length === 0 && <div className="rounded-2xl border border-border bg-white p-10 text-center"><Clock3 size={28} className="mx-auto text-muted"/><h3 className="mt-3 font-semibold text-primary">No companies in this category</h3><p className="mt-2 text-sm text-muted">New customer applications will appear here.</p></div>}

      <div className="grid gap-4 xl:grid-cols-2">
        {(query.data || []).map((company) => <section key={company.id} className="rounded-2xl border border-border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-cream p-3 text-primary"><Building2 size={23}/></span><div className="min-w-0"><h3 className="truncate text-lg font-bold text-primary">{company.name}</h3><p className="text-xs text-muted">{company.country} · {new Date(company.createdAt).toLocaleDateString()}</p></div></div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${company.status === "ACTIVE" ? "bg-green-50 text-green-800" : "bg-cream text-primary"}`}>{statusLabels[company.status] || company.status}</span>
          </div>
          <div className="mt-5 space-y-1.5 text-sm text-muted-foreground"><p><strong className="text-primary">Requested by:</strong> {company.requestedBy?.name || "Unknown"} ({company.requestedBy?.email || "No email"})</p><p><strong className="text-primary">Company email:</strong> {company.email || "Not provided"}</p><p><strong className="text-primary">Phone:</strong> {company.phone || "Not provided"}</p><p><strong className="text-primary">Members:</strong> {company.memberships.length}</p></div>
          {company.wazoTenantUuid && <p className="mt-3 break-all text-xs text-muted">Wazo tenant: {company.wazoTenantUuid}</p>}
          {company.rejectionReason && <p className="mt-3 rounded-xl bg-cream/40 p-3 text-sm text-primary">Reason: {company.rejectionReason}</p>}
          {company.provisioningError && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">Provisioning issue: {company.provisioningError}</p>}
          {company.status === "PENDING" && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5"><button type="button" onClick={() => { setConfirming(company); setFeedback(""); approve.reset(); }} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"><Check size={17}/> Approve & provision</button><button type="button" onClick={() => { setRejecting(company); setReason(""); setFeedback(""); reject.reset(); }} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"><X size={17}/> Reject</button></div>}
        </section>)}
      </div>

      {confirming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="approve-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 id="approve-title" className="text-xl font-bold text-primary">Approve {confirming.name}?</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">This creates a Wazo tenant, configures internal and incoming calling contexts, and activates company access. The request may take time.</p><div className="mt-6 flex gap-3"><button type="button" onClick={() => setConfirming(null)} disabled={busy} className="flex-1 rounded-xl border border-border py-3 font-semibold text-primary disabled:opacity-50">Cancel</button><button type="button" onClick={() => approve.mutate(confirming.id)} disabled={busy} className="flex-1 rounded-xl bg-primary py-3 font-semibold text-white disabled:opacity-50">{approve.isPending ? "Provisioning..." : "Approve"}</button></div></div></div>}

      {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="reject-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 id="reject-title" className="text-xl font-bold text-primary">Reject {rejecting.name}?</h3><p className="mt-2 text-sm text-muted">Provide a reason (5–500 characters).</p><form onSubmit={(event) => { event.preventDefault(); reject.mutate({ id: rejecting.id, reason: reason.trim() }); }}><textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-4 w-full rounded-xl border border-border p-3 text-primary outline-none focus:border-primary"/><div className="mt-5 flex gap-3"><button type="button" onClick={() => setRejecting(null)} disabled={busy} className="flex-1 rounded-xl border border-border py-3 font-semibold text-primary disabled:opacity-50">Cancel</button><button type="submit" disabled={busy || reason.trim().length < 5} className="flex-1 rounded-xl bg-danger py-3 font-semibold text-white disabled:opacity-50">{reject.isPending ? "Rejecting..." : "Reject application"}</button></div></form></div></div>}
    </div>
  );
}
