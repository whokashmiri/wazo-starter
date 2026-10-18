import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Headset, Loader2, Plus, Trash2, Workflow } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/client';
import { companiesApi } from '../../companies/companies.api';
import { greetingsApi } from '../../greetings/api/greetings.api';
import { ivrApi, type IvrItem, type CreateIvrPayload } from '../api/ivr.api';

type ChoiceRow = { key: number; digit: string; queueId: string };
const inputClass = 'w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-primary outline-none focus:border-primary';
let nextKey = 1;

function IvrRoutePanel({ tenantUuid, ivr, canManage }: {
  tenantUuid: string;
  ivr: IvrItem;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [extension, setExtension] = useState('');
  const [showRemove, setShowRemove] = useState(false);
  const routeKey = ['ivr-internal-routes', tenantUuid, ivr.id];
  const routes = useQuery({ queryKey: routeKey, queryFn: () => ivrApi.listRoutes(tenantUuid, ivr.id) });
  const add = useMutation({
    mutationFn: () => ivrApi.addRoute(tenantUuid, ivr.id, extension),
    onSuccess: async () => { setExtension(''); await qc.invalidateQueries({ queryKey: routeKey }); },
  });
  const remove = useMutation({
    mutationFn: () => ivrApi.removeRoutes(tenantUuid, ivr.id),
    onSuccess: async () => { setShowRemove(false); await qc.invalidateQueries({ queryKey: routeKey }); },
  });
  return (
    <div className="mt-4 border-t border-border pt-4">
      <h4 className="text-sm font-semibold text-primary">Internal test dialing</h4>
      <p className="mt-1 text-xs text-muted">Optional. Assign an internal 7000–7999 number to test the IVR from a registered SIP phone. This is not a public phone number.</p>
      {routes.isPending && <p className="mt-3 text-sm text-muted">Loading internal routes...</p>}
      {routes.isError && <p role="alert" className="mt-3 text-sm text-danger">{getApiErrorMessage(routes.error)}</p>}
      {!!routes.data?.length && (
        <div className="mt-3 space-y-2">
          {routes.data.map((route) => (
            <div key={`${route.context}:${route.extension}`} className="flex items-center justify-between rounded-lg bg-page p-3 text-sm">
              <span className="font-semibold text-primary">{route.extension} <span className="font-normal text-muted">({route.context})</span></span>
              <span className={route.active ? 'text-success' : 'text-danger'}>{route.active ? 'Active' : 'Not active'}</span>
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <>
          <form onSubmit={(event) => { event.preventDefault(); if (/^7\d{3}$/.test(extension)) add.mutate(); }} className="mt-3 flex flex-wrap gap-2">
            <input aria-label="IVR internal test extension" placeholder="e.g. 7001" inputMode="numeric" maxLength={4} value={extension} onChange={(e) => setExtension(e.target.value)} className={`${inputClass} max-w-44`} />
            <button disabled={add.isPending || !/^7\d{3}$/.test(extension) || routes.isPending || routes.isError} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{add.isPending ? 'Setting up...' : 'Assign test number'}</button>
          </form>
          {routes.data && routes.data.length > 0 && (
            <div className="mt-3">
              {!showRemove ? (
                <button type="button" onClick={() => setShowRemove(true)} className="text-xs font-semibold text-danger">Remove internal routes</button>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-background p-3 text-sm">
                  <span className="text-danger">Remove all test routes for this IVR?</span>
                  <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} className="font-semibold text-danger">Confirm remove</button>
                  <button type="button" onClick={() => setShowRemove(false)} className="text-primary">Cancel</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {add.isError && <p role="alert" className="mt-3 text-sm text-danger">{getApiErrorMessage(add.error)}</p>}
      {remove.isError && <p role="alert" className="mt-3 text-sm text-danger">{getApiErrorMessage(remove.error)}</p>}
      {add.isSuccess && <p className="mt-3 text-xs text-success">Internal test route configured. Confirm the status above.</p>}
    </div>
  );
}

export default function IvrPage() {
  const qc = useQueryClient();
  const [tenantUuid, setTenantUuid] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sound, setSound] = useState('');
  const [timeout, setTimeout] = useState(5);
  const [maxTries, setMaxTries] = useState(3);
  const [choices, setChoices] = useState<ChoiceRow[]>([{ key: 0, digit: '1', queueId: '' }]);
  const [formError, setFormError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const companiesQuery = useQuery({ queryKey: ['account', 'companies'], queryFn: companiesApi.listMine });
  const companies = useMemo(() => (companiesQuery.data || []).filter((c) => c.status === 'ACTIVE' && c.wazoTenantUuid && c.memberships.some((m) => m.role === 'COMPANY_ADMIN' || m.role === 'SUPERVISOR')), [companiesQuery.data]);
  useEffect(() => {
    if (companies.some((c) => c.wazoTenantUuid === tenantUuid)) return;
    setTenantUuid(companies[0]?.wazoTenantUuid || '');
  }, [companies, tenantUuid]);
  const company = companies.find((c) => c.wazoTenantUuid === tenantUuid);
  const canManage = Boolean(company?.memberships.some((m) => m.role === 'COMPANY_ADMIN'));

  const ivrs = useQuery({ queryKey: ['ivrs', tenantUuid], queryFn: () => ivrApi.list(tenantUuid), enabled: !!tenantUuid });
  const departments = useQuery({ queryKey: ['departments', tenantUuid], queryFn: () => ivrApi.departments(tenantUuid), enabled: !!tenantUuid });
  const greetings = useQuery({ queryKey: ['greetings', tenantUuid], queryFn: () => greetingsApi.list(tenantUuid), enabled: !!tenantUuid });
  const create = useMutation({
    mutationFn: (payload: CreateIvrPayload) => ivrApi.create(tenantUuid, payload),
    onSuccess: async (ivr) => {
      await qc.invalidateQueries({ queryKey: ['ivrs', tenantUuid] });
      setExpandedId(ivr.id);
      setShowCreate(false);
      setName(''); setDescription(''); setSound(''); setTimeout(5); setMaxTries(3);
      setChoices([{ key: nextKey++, digit: '1', queueId: '' }]);
      setFormError('');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (!canManage) return;
    if (name.trim().length < 2 || name.trim().length > 80) return setFormError('IVR name must contain 2–80 characters.');
    if (!sound || !greetings.data?.some((g) => g.menuSound === sound)) return setFormError('Choose a saved greeting.');
    if (choices.length < 1 || choices.length > 10) return setFormError('Add 1–10 keypad choices.');
    const digits = choices.map((c) => c.digit);
    if (digits.some((digit) => !/^[0-9]$/.test(digit)) || new Set(digits).size !== digits.length) return setFormError('Each choice needs a unique digit from 0 to 9.');
    const validIds = new Set((departments.data || []).map((d) => d.queueId ?? d.id));
    if (choices.some((c) => !validIds.has(Number(c.queueId)))) return setFormError('Select a valid department for each digit.');
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30 || !Number.isInteger(maxTries) || maxTries < 1 || maxTries > 10) return setFormError('Invalid timeout or maximum tries.');
    create.mutate({ name: name.trim(), description: description.trim(), menuSound: sound, timeout, maxTries, choices: choices.map((c) => ({ digit: c.digit, queueId: Number(c.queueId) })) });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-sm text-muted"><Workflow size={18} /> Call Management</div><h2 className="text-3xl font-bold text-primary">IVR Builder</h2><p className="mt-2 text-sm text-muted">Create keypad menus and route callers to your company departments.</p></div>
        {canManage && <button type="button" onClick={() => { create.reset(); setFormError(''); setShowCreate((v) => !v); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white"><Plus size={18} /> New IVR</button>}
      </div>
      {companiesQuery.isPending && <p className="text-sm text-muted"><Loader2 className="mr-2 inline animate-spin" size={16} />Loading companies...</p>}
      {companiesQuery.isError && <p role="alert" className="rounded-xl bg-danger-background p-4 text-danger">{getApiErrorMessage(companiesQuery.error)}</p>}
      {!companiesQuery.isPending && !companiesQuery.isError && !companies.length && <div className="rounded-2xl border border-border bg-white p-6 text-sm text-muted">No approved company is available. <Link to="/company" className="font-semibold text-primary underline">View My Company</Link></div>}
      {companies.length > 0 && <div className="rounded-2xl border border-border bg-white p-5"><label htmlFor="ivr-company" className="mb-2 block text-sm font-semibold text-primary">Company</label><select id="ivr-company" className={`${inputClass} max-w-lg`} value={tenantUuid} onChange={(e) => { setTenantUuid(e.target.value); setShowCreate(false); setExpandedId(null); }} >{companies.map((c) => <option key={c.id} value={c.wazoTenantUuid || ''}>{c.name}</option>)}</select></div>}
      {showCreate && canManage && (
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-white p-5 sm:p-7">
          <div><h3 className="text-xl font-bold text-primary">Create an IVR menu</h3><p className="mt-1 text-sm text-muted">Select an uploaded recording and assign keypad digits to departments.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="ivr-name" className="mb-2 block text-sm font-semibold">IVR name</label><input id="ivr-name" className={inputClass} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Main welcome menu" /></div>
            <div><label htmlFor="ivr-sound" className="mb-2 block text-sm font-semibold">Greeting audio</label><select id="ivr-sound" className={inputClass} required value={sound} onChange={(e) => setSound(e.target.value)}><option value="">Select a greeting</option>{(greetings.data || []).map((g) => <option key={g.id} value={g.menuSound}>{g.name}</option>)}</select>{!greetings.isPending && !greetings.data?.length && <p className="mt-2 text-xs text-muted">No greetings uploaded. <Link className="font-semibold text-primary underline" to="/company/greetings">Upload one first</Link>.</p>}</div>
          </div>
          <div><label htmlFor="ivr-description" className="mb-2 block text-sm font-semibold">Description (optional)</label><input id="ivr-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={250} placeholder="Routes callers to Sales or Support" className={inputClass} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="ivr-timeout" className="mb-2 block text-sm font-semibold">Keypad timeout (seconds)</label><input id="ivr-timeout" type="number" min={1} max={30} className={inputClass} value={timeout} onChange={(e) => setTimeout(Number(e.target.value))}/></div><div><label htmlFor="ivr-retries" className="mb-2 block text-sm font-semibold">Maximum tries</label><input id="ivr-retries" type="number" min={1} max={10} className={inputClass} value={maxTries} onChange={(e) => setMaxTries(Number(e.target.value))}/></div></div>
          <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold text-primary">Keypad choices</h4><p className="text-xs text-muted">Each digit directs callers to one Wazo department queue.</p></div><button type="button" disabled={choices.length >= 10} onClick={() => setChoices((prev) => [...prev, { key: nextKey++, digit: '', queueId: '' }])} className="inline-flex items-center gap-1 text-sm font-semibold text-primary disabled:opacity-40"><Plus size={16}/> Add choice</button></div>
            {choices.map((row, idx) => <div key={row.key} className="flex flex-wrap items-end gap-3 rounded-xl bg-page p-3"><div className="w-28"><label htmlFor={`ivr-digit-${row.key}`} className="mb-1 block text-xs font-semibold">Digit</label><select id={`ivr-digit-${row.key}`} className={inputClass} value={row.digit} onChange={(e) => setChoices((prev) => prev.map((r) => r.key === row.key ? { ...r, digit: e.target.value } : r))}><option value="">Choose</option>{Array.from({ length: 10 }, (_, i) => String(i)).map((digit) => <option key={digit} value={digit}>{digit}</option>)}</select></div><div className="min-w-48 flex-1"><label htmlFor={`ivr-queue-${row.key}`} className="mb-1 block text-xs font-semibold">Department</label><select id={`ivr-queue-${row.key}`} className={inputClass} value={row.queueId} onChange={(e) => setChoices((prev) => prev.map((r) => r.key === row.key ? { ...r, queueId: e.target.value } : r))}><option value="">Select department</option>{(departments.data || []).map((d) => <option key={d.id} value={d.queueId ?? d.id}>{d.name}</option>)}</select></div><button type="button" aria-label={`Remove choice ${idx + 1}`} disabled={choices.length === 1} onClick={() => setChoices((prev) => prev.filter((r) => r.key !== row.key))} className="mb-1 rounded-xl p-3 text-danger disabled:opacity-30"><Trash2 size={18}/></button></div>)}
          </div>
          {greetings.isError && <p role="alert" className="text-sm text-danger">Could not load greetings: {getApiErrorMessage(greetings.error)}</p>}
          {departments.isError && <p role="alert" className="text-sm text-danger">Could not load departments: {getApiErrorMessage(departments.error)}</p>}
          {formError && <p role="alert" className="rounded-xl bg-danger-background p-3 text-sm text-danger">{formError}</p>}
          {create.isError && <p role="alert" className="rounded-xl bg-danger-background p-3 text-sm text-danger">{getApiErrorMessage(create.error)}</p>}
          <div className="flex flex-wrap gap-3"><button type="submit" disabled={create.isPending || greetings.isPending || departments.isPending || greetings.isError || departments.isError} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{create.isPending ? 'Creating IVR...' : 'Create IVR'}</button><button type="button" disabled={create.isPending} onClick={() => setShowCreate(false)} className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-primary">Cancel</button></div>
        </form>
      )}
      {tenantUuid && <section className="space-y-3"><div className="flex items-center gap-2"><Headset size={20} className="text-primary"/><h3 className="text-xl font-bold text-primary">Your IVR menus</h3></div>
        {ivrs.isPending && <div className="rounded-xl border border-border bg-white p-6 text-muted">Loading IVRs...</div>}
        {ivrs.isError && <div role="alert" className="rounded-xl bg-danger-background p-4 text-danger">{getApiErrorMessage(ivrs.error)}</div>}
        {ivrs.data?.length === 0 && <div className="rounded-xl border border-border bg-white p-8 text-center text-muted">No IVRs yet. Create a greeting first, then build your first menu.</div>}
        {(ivrs.data || []).map((ivr) => <article key={ivr.id} className="rounded-2xl border border-border bg-white p-5 sm:p-6"><button type="button" className="flex w-full items-center justify-between gap-4 text-left" onClick={() => setExpandedId((value) => value === ivr.id ? null : ivr.id)}><div><h4 className="text-lg font-bold text-primary">{ivr.name}</h4><p className="mt-1 text-xs text-muted">Wazo IVR #{ivr.id} · {ivr.choices.length} keypad choice(s)</p></div><span className="text-xs font-semibold text-primary">{expandedId === ivr.id ? 'Hide details' : 'View details'}</span></button>
          {expandedId === ivr.id && <div className="mt-4 space-y-3"><p className="text-sm text-muted">{ivr.description || 'No description'}</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-page p-3 text-sm"><p className="text-xs text-muted">Greeting</p><p className="mt-1 break-all font-medium text-primary">{greetings.data?.find((g) => g.menuSound === ivr.menuSound)?.name || ivr.menuSound}</p></div><div className="rounded-xl bg-page p-3 text-sm"><p className="text-xs text-muted">Timeout / retries</p><p className="mt-1 font-medium text-primary">{ivr.timeout}s / {ivr.maxTries} tries</p></div></div><div><h5 className="mb-2 text-sm font-semibold text-primary">Keypad mapping</h5>{ivr.choices.map((choice, index) => <div key={`${choice.digit}-${index}`} className="flex items-center gap-3 border-b border-border py-2 text-sm"><span className="rounded-lg bg-cream px-3 py-1 font-bold text-primary">{choice.digit}</span><span className="text-muted">→</span><span className="text-primary">{departments.data?.find((d) => (d.queueId ?? d.id) === choice.destination?.queue_id)?.name || (choice.destination?.queue_id ? `Queue #${choice.destination.queue_id}` : JSON.stringify(choice.destination))}</span></div>)}</div><IvrRoutePanel key={`${tenantUuid}:${ivr.id}`} tenantUuid={tenantUuid} ivr={ivr} canManage={canManage}/></div>}
        </article>)}
      </section>}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-cream/30 p-4 text-sm text-primary"><CheckCircle2 className="mt-0.5 shrink-0" size={18}/><span>Creating an IVR sets up a Wazo menu. An optional 7000–7999 test route lets employees dial it internally. Public callers will not reach it until a DID and incoming call routing are configured.</span></div>
    </div>
  );
}
