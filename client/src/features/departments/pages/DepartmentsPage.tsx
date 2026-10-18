import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, CheckCircle2, ChevronDown, ChevronUp, Loader2, Network, Plus, Search, Users, X } from "lucide-react";
import { getApiErrorMessage } from "../../../api/client";
import { departmentsApi, type Department, type Employee } from "../api/department.api";

const strategies = [
  { value: "ringall", label: "Ring all employees" },
  { value: "rrmemory", label: "Round robin" },
  { value: "leastrecent", label: "Least recently called" },
  { value: "fewestcalls", label: "Fewest calls" },
  { value: "random", label: "Random" },
  { value: "linear", label: "Sequential" },
];


import type { WazoEmployee } from "../../employee/types";

// Supports both array responses and Wazo paginated responses.
function normalizeEmployees(data: unknown): WazoEmployee[] {
  if (Array.isArray(data)) {
    return data as WazoEmployee[];
  }

  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray(data.items)
  ) {
    return data.items as WazoEmployee[];
  }

  return [];
}


const fullName = (user: Employee) => [user.firstname, user.lastname].filter(Boolean).join(" ");

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [tenantUuid, setTenantUuid] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("ringall");
  const [employeeSelections, setEmployeeSelections] = useState<Record<number, string>>( {} );
  const [extensions, setExtensions] = useState<Record<number, string>>( {} );
  const [success, setSuccess] = useState("");

  const companiesQuery = useQuery({ queryKey: ["account", "companies"], queryFn: departmentsApi.companies });
  const companies = useMemo(() => (companiesQuery.data || []).filter(c => c.status === "ACTIVE" && !!c.wazoTenantUuid && c.memberships.some(m => m.role === "COMPANY_ADMIN" || m.role === "SUPERVISOR")), [companiesQuery.data]);

  useEffect(() => {
    if (!companies.some(c => c.wazoTenantUuid === tenantUuid)) {
      setTenantUuid(companies[0]?.wazoTenantUuid || "");
    }
  }, [companies, tenantUuid]);

  const company = companies.find(c => c.wazoTenantUuid === tenantUuid);
  const canManage = company?.memberships.some(m => m.role === "COMPANY_ADMIN") || false;
  const departmentsQuery = useQuery({
    queryKey: ["departments", tenantUuid],
    queryFn: () => departmentsApi.list(tenantUuid),
    enabled: !!tenantUuid,
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", tenantUuid],
    queryFn: () => departmentsApi.employees(tenantUuid),
    enabled: !!tenantUuid,
  });
  const departmentDetailQuery = useQuery({
    queryKey: ["department", tenantUuid, openId],
    queryFn: () => departmentsApi.get(tenantUuid, openId!),
    enabled: !!tenantUuid && openId !== null,
  });

  async function refresh(queueId?: number) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["departments", tenantUuid] }),
      ...(queueId !== undefined ? [qc.invalidateQueries({ queryKey: ["department", tenantUuid, queueId] })] : []),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: () => departmentsApi.create(tenantUuid, { name: name.trim(), strategy }),
    onSuccess: async (department) => {
      setCreating(false); setName(""); setStrategy("ringall");
      setOpenId(department.id); setSuccess("Department created. Assign employees and configure a queue extension.");
      await refresh();
    },
  });
  const memberMutation = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number }) => departmentsApi.addMember(tenantUuid, id, userId),
    onSuccess: async (_, variables) => { setSuccess("Employee assigned to department."); await refresh(variables.id); },
  });
  const extensionMutation = useMutation({
    mutationFn: ({ id, extension }: { id: number; extension: string }) => departmentsApi.setupExtension(tenantUuid, id, extension),
    onSuccess: async (result, variables) => {
      setSuccess(`${result.message}: ${result.extension}`);
      await refresh(variables.id);
    },
  });

  const displayed = (departmentsQuery.data || []).filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
 const employees = normalizeEmployees(employeesQuery.data);
  const feedback = createMutation.error || memberMutation.error || extensionMutation.error;

  function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || name.trim().length < 2 || name.trim().length > 80) return;
    setSuccess(""); createMutation.mutate();
  }

  function openDepartment(id: number) {
    setOpenId(v => v === id ? null : id);
    setSuccess("");
    createMutation.reset(); memberMutation.reset(); extensionMutation.reset();
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Call management</p>
          <h1 className="text-3xl font-bold text-primary">Departments</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create Wazo queues, assign employees, and configure dialable extensions.</p>
        </div>
        {canManage && <button type="button" onClick={() => { setCreating(true); createMutation.reset(); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white hover:bg-primary/90"><Plus size={18}/> New department</button>}
      </div>

      {companiesQuery.isPending ? <Loading text="Loading companies..." /> : companiesQuery.isError ? <ErrorText error={companiesQuery.error}/> : companies.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8">
          <Building2 className="mb-4 text-primary" size={30}/>
          <h2 className="text-xl font-bold text-primary">No active company</h2>
          <p className="mt-2 text-muted-foreground">Create a company and wait for platform approval before managing departments.</p>
          <Link className="mt-5 inline-flex items-center gap-2 font-semibold text-primary" to="/company">My Company <ArrowRight size={17}/></Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-white p-5">
            <div className="w-full max-w-sm">
              <label className="mb-2 block text-sm font-semibold text-primary" htmlFor="dept-company">Company</label>
              <select id="dept-company" value={tenantUuid} onChange={e => { setTenantUuid(e.target.value); setOpenId(null); }} className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-primary">
                {companies.map(c => <option key={c.id} value={c.wazoTenantUuid || ""}>{c.name}</option>)}
              </select>
            </div>
            <div className="relative w-full max-w-xs">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/>
              <input className="w-full rounded-xl border border-border py-2.5 pl-10 pr-3 text-primary" placeholder="Search departments" value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
          </div>

          {success && <div role="status" className="flex items-center gap-2 rounded-xl bg-success-background p-4 text-sm font-medium text-success"><CheckCircle2 size={19}/>{success}</div>}
          {feedback && <ErrorText error={feedback}/>}
          {departmentsQuery.isPending ? <Loading text="Loading departments..."/> : departmentsQuery.isError ? <ErrorText error={departmentsQuery.error}/> : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Summary label="Departments" value={departmentsQuery.data?.length || 0} icon={<Network size={22}/>}/>
                <Summary label="Provisioned employees" value={employees.filter(u => (u.lines?.length || 0) > 0).length} icon={<Users size={22}/>}/>
              </div>
              {displayed.map(department => {
                const isOpen = openId === department.id;
                const detailed: Department = isOpen && departmentDetailQuery.data ? departmentDetailQuery.data : department;
                const members = detailed.members?.users || [];
                const available  = employees.filter(
                  (employee) =>
                    employee.enabled !== false &&
                    Array.isArray(employee.lines) &&
                    employee.lines.length > 0
                  );
                const selectedUserId = employeeSelections[department.id] || "";
                const extValue = extensions[department.id] || "";
                return (
                  <section key={department.id} className="overflow-hidden rounded-2xl border border-border bg-white">
                    <button type="button" onClick={() => openDepartment(department.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-cream/30" aria-expanded={isOpen}>
                      <div className="flex items-center gap-3"><span className="rounded-xl bg-cream p-3 text-primary"><Network size={21}/></span><div><h2 className="font-bold text-primary">{department.name}</h2><p className="text-xs text-muted">Queue #{department.id} · {department.strategy || "Queue"}</p></div></div>
                      <div className="flex items-center gap-3"><span className="hidden text-sm text-muted sm:block">{members.length} members</span>{isOpen ? <ChevronUp size={19}/> : <ChevronDown size={19}/>}</div>
                    </button>
                    {isOpen && (
                      <div className="space-y-5 border-t border-border p-5">
                        {departmentDetailQuery.isPending ? <Loading text="Loading queue details..."/> : departmentDetailQuery.isError ? <ErrorText error={departmentDetailQuery.error}/> : <>
                          <div><h3 className="mb-3 font-semibold text-primary">Assigned employees</h3>
                            {members.length ? <div className="flex flex-wrap gap-2">{members.map((m,i) => <span key={m.uuid || m.id || i} className="rounded-full bg-cream px-3 py-1.5 text-sm text-primary">{[m.firstname,m.lastname].filter(Boolean).join(" ") || m.name || m.uuid || `Member ${i+1}`}</span>)}</div> : <p className="text-sm text-muted">No employees assigned yet.</p>}
                          </div>
                          {detailed.extensions && detailed.extensions.length > 0 && <div className="rounded-xl bg-success-background p-3 text-sm text-success">Queue extension: {detailed.extensions.map(e => e.exten).join(", ")}</div>}
                          {canManage && <div className="grid gap-5 lg:grid-cols-2">
                            <div className="rounded-xl border border-border p-4"><h3 className="mb-2 font-semibold text-primary">Assign employee</h3><p className="mb-3 text-xs text-muted">Only enabled employees with a SIP line can join queues.</p>
                              {employeesQuery.isError ? <ErrorText error={employeesQuery.error}/> : <div className="flex gap-2"><select aria-label="Employee to assign" className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-primary" value={selectedUserId} onChange={e => setEmployeeSelections(prev => ({...prev,[department.id]:e.target.value}))}><option value="">Select an employee</option>{available.map(u => <option key={u.id} value={u.id}>{fullName(u)} (#{u.id})</option>)}</select><button type="button" disabled={!selectedUserId || memberMutation.isPending} onClick={() => { setSuccess(""); memberMutation.mutate({id:department.id,userId:Number(selectedUserId)}); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{memberMutation.isPending ? "Adding..." : "Add"}</button></div>}
                            </div>
                            <div className="rounded-xl border border-border p-4"><h3 className="mb-2 font-semibold text-primary">Queue extension</h3><p className="mb-3 text-xs text-muted">Use a free number between 2000 and 2099. Add a member first.</p>
                              <div className="flex gap-2"><input aria-label="Queue extension" inputMode="numeric" maxLength={4} placeholder="2000" value={extValue} onChange={e => setExtensions(prev => ({...prev,[department.id]:e.target.value}))} className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2.5 text-primary"/><button type="button" disabled={!/^20\d{2}$/.test(extValue) || Number(extValue) > 2099 || members.length === 0 || extensionMutation.isPending || !!detailed.extensions?.length} onClick={() => { setSuccess(""); extensionMutation.mutate({id:department.id,extension:extValue}); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{extensionMutation.isPending ? "Saving..." : "Configure"}</button></div>
                            </div>
                          </div>}
                        </>}
                      </div>
                    )}
                  </section>
                );
              })}
              {!displayed.length && <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted">No departments found.</div>}
            </div>
          )}
        </>
      )}

      {creating && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4"><div role="dialog" aria-modal="true" aria-labelledby="create-dept-heading" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between"><div><h2 id="create-dept-heading" className="text-xl font-bold text-primary">Create department</h2><p className="mt-1 text-sm text-muted">Creates a Wazo call queue</p></div><button type="button" aria-label="Close" disabled={createMutation.isPending} onClick={() => setCreating(false)} className="rounded-lg p-2 text-muted hover:bg-cream"><X size={20}/></button></div>
        <form onSubmit={createDepartment} className="space-y-4"><div><label htmlFor="dept-name" className="mb-2 block text-sm font-semibold text-primary">Department name</label><input id="dept-name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Customer Support" className="w-full rounded-xl border border-border px-4 py-3 text-primary"/></div>
          <div><label htmlFor="dept-strategy" className="mb-2 block text-sm font-semibold text-primary">Call distribution</label><select id="dept-strategy" value={strategy} onChange={e=>setStrategy(e.target.value)} className="w-full rounded-xl border border-border bg-white px-4 py-3 text-primary">{strategies.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          {createMutation.isError && <ErrorText error={createMutation.error}/>}<button type="submit" disabled={createMutation.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-50">{createMutation.isPending && <Loader2 size={18} className="animate-spin"/>}Create department</button></form>
      </div></div>}
    </div>
  );
}

function Loading({text}:{text:string}) { return <div className="flex items-center gap-2 p-5 text-sm text-muted"><Loader2 size={18} className="animate-spin"/>{text}</div>; }
function ErrorText({error}:{error:unknown}) { return <div role="alert" className="rounded-xl bg-danger-background p-4 text-sm text-danger">{getApiErrorMessage(error)}</div>; }
function Summary({label,value,icon}:{label:string;value:number;icon:ReactNode}) { return <div className="rounded-2xl border border-border bg-white p-5"><span className="text-primary">{icon}</span><p className="mt-3 text-2xl font-bold text-primary">{value}</p><p className="text-sm text-muted">{label}</p></div>; }
