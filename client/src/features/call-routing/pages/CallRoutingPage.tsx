import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Loader2, PhoneIncoming, Plus, RefreshCw, Route, Trash2, Workflow } from 'lucide-react';
import { companiesApi } from '../../companies/companies.api';
import { getApiErrorMessage } from '../../../api/client';
import { callRoutingApi, type IvrSummary, type InternalIvrRoute } from '../api/call-routing.api';

function permittedCompany(company: Awaited<ReturnType<typeof companiesApi.listMine>>[number]) {
  return company.status === 'ACTIVE' && Boolean(company.wazoTenantUuid) &&
    company.memberships.some((member) => member.role === 'COMPANY_ADMIN' || member.role === 'SUPERVISOR');
}

function ErrorBox({ error }: { error: unknown }) {
  return <div role="alert" className="rounded-xl border border-danger/20 bg-danger-background p-4 text-sm text-danger">{getApiErrorMessage(error)}</div>;
}

function getIvrName(ivrs: IvrSummary[], id: number | undefined) {
  return ivrs.find((ivr) => ivr.id === id)?.name || (id ? `IVR #${id}` : 'Unassigned');
}

export default function CallRoutingPage() {
  const queryClient = useQueryClient();
  const [tenantUuid, setTenantUuid] = useState('');
  const [testIvrId, setTestIvrId] = useState('');
  const [testExtension, setTestExtension] = useState('');
  const [didIvrId, setDidIvrId] = useState('');
  const [testDid, setTestDid] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');

  const companiesQuery = useQuery({
    queryKey: ['account', 'companies'],
    queryFn: companiesApi.listMine,
  });
  const companies = useMemo(
    () => (companiesQuery.data ?? []).filter(permittedCompany),
    [companiesQuery.data]
  );

  useEffect(() => {
    if (companies.some((company) => company.wazoTenantUuid === tenantUuid)) return;
    setTenantUuid(companies[0]?.wazoTenantUuid || '');
  }, [companies, tenantUuid]);

  const selectedCompany = companies.find((company) => company.wazoTenantUuid === tenantUuid);
  const canManage = selectedCompany?.memberships.some((member) => member.role === 'COMPANY_ADMIN') || false;

  const ivrsQuery = useQuery({
    queryKey: ['ivr', tenantUuid],
    queryFn: () => callRoutingApi.listIvrs(tenantUuid),
    enabled: Boolean(tenantUuid),
  });
  const didsQuery = useQuery({
    queryKey: ['routing', 'dids', tenantUuid],
    queryFn: () => callRoutingApi.listLocalDids(tenantUuid),
    enabled: Boolean(tenantUuid),
  });
  const ivrs = ivrsQuery.data ?? [];
  const dids = didsQuery.data ?? [];

  useEffect(() => {
    if (!ivrs.some((ivr) => String(ivr.id) === testIvrId)) setTestIvrId(ivrs[0] ? String(ivrs[0].id) : '');
    if (!ivrs.some((ivr) => String(ivr.id) === didIvrId)) setDidIvrId(ivrs[0] ? String(ivrs[0].id) : '');
  }, [ivrs, testIvrId, didIvrId]);

  const internalQueries = useQueries({
    queries: ivrs.map((ivr) => ({
      queryKey: ['routing', 'internal', tenantUuid, ivr.id],
      queryFn: () => callRoutingApi.listInternal(tenantUuid, ivr.id),
      enabled: Boolean(tenantUuid),
      staleTime: 10_000,
    })),
  });

  const internalRoutes = internalQueries.flatMap((query) => query.data ?? []);
  const internalLoading = internalQueries.some((query) => query.isPending);
  const internalError = internalQueries.find((query) => query.isError)?.error;
  const busy = internalQueries.some((query) => query.isFetching);

  const refresh = async () => {
    setFeedback('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ivr', tenantUuid] }),
      queryClient.invalidateQueries({ queryKey: ['routing', 'internal', tenantUuid] }),
      queryClient.invalidateQueries({ queryKey: ['routing', 'dids', tenantUuid] }),
    ]);
  };

  const addInternal = useMutation({
    mutationFn: () => callRoutingApi.addInternal(tenantUuid, Number(testIvrId), testExtension.trim()),
    onSuccess: async () => {
      setTestExtension('');
      setFeedback('Internal IVR test route saved and checked in Asterisk.');
      await queryClient.invalidateQueries({ queryKey: ['routing', 'internal', tenantUuid] });
    },
  });

  const removeInternal = useMutation({
    mutationFn: (ivrId: number) => callRoutingApi.removeInternal(tenantUuid, ivrId),
    onSuccess: async () => {
      setFeedback('Internal IVR routes removed.');
      await queryClient.invalidateQueries({ queryKey: ['routing', 'internal', tenantUuid] });
    },
  });

  const createDid = useMutation({
    mutationFn: () => callRoutingApi.createLocalDid(tenantUuid, testDid.trim(), Number(didIvrId)),
    onSuccess: async () => {
      setTestDid('');
      setFeedback('Local test DID provisioned. This does not connect a real carrier.');
      await queryClient.invalidateQueries({ queryKey: ['routing', 'dids', tenantUuid] });
    },
  });

  const activateDid = useMutation({
    mutationFn: (incallId: number) => callRoutingApi.activateLocalDid(tenantUuid, incallId),
    onSuccess: async () => {
      setFeedback('Local test DID dialplan activation completed.');
      await queryClient.invalidateQueries({ queryKey: ['routing', 'dids', tenantUuid] });
    },
  });

  function submitInternal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');
    if (!canManage) return;
    if (!testIvrId || !/^7\d{3}$/.test(testExtension.trim())) {
      setFormError('Choose an IVR and enter an extension from 7000 to 7999.');
      return;
    }
    setFormError('');
    addInternal.reset();
    addInternal.mutate();
  }

  function submitDid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');
    if (!canManage) return;
    if (!didIvrId || !/^9\d{7}$/.test(testDid.trim())) {
      setFormError('Choose an IVR and enter an 8-digit local test DID starting with 9.');
      return;
    }
    setFormError('');
    createDid.reset();
    createDid.mutate();
  }

  function confirmRemove(route: InternalIvrRoute) {
    if (!canManage) return;
    // Backend removes ALL internal routes assigned to this IVR.
    if (!window.confirm(`Remove every internal test extension assigned to IVR #${route.ivrId}?`)) return;
    setFeedback('');
    removeInternal.mutate(route.ivrId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted"><Route size={17} /> Company / Call Routing</div>
          <h1 className="text-3xl font-bold text-primary">Call Routing</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage internal IVR test numbers and local incoming DID routes.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={!tenantUuid || busy} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-50">
          <RefreshCw size={17} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-warm bg-warm/15 p-4 text-sm leading-6 text-primary">
        <strong>Local testing only:</strong> DID numbers here are simulated 8-digit identifiers beginning with 9, not real Saudi telephone numbers. A real carrier/SIP trunk, verified number ownership, and inbound routing configuration are required before public callers can reach them.
      </div>

      {companiesQuery.isPending && <p className="flex items-center gap-2 text-muted"><Loader2 size={18} className="animate-spin" /> Loading companies...</p>}
      {companiesQuery.isError && <ErrorBox error={companiesQuery.error} />}
      {!companiesQuery.isPending && !companiesQuery.isError && companies.length === 0 && (
        <div className="rounded-xl border border-border bg-white p-6 text-sm">No approved company is available. <Link to="/company" className="font-semibold text-primary underline">View company status</Link>.</div>
      )}

      {companies.length > 0 && <>
        <div className="rounded-2xl border border-border bg-white p-5">
          <label htmlFor="routing-company" className="mb-2 block text-sm font-semibold text-primary">Company</label>
          <select id="routing-company" value={tenantUuid} onChange={(event) => { setTenantUuid(event.target.value); setFeedback(''); setFormError(''); }} className="w-full max-w-md rounded-xl border border-border bg-white p-3 text-primary">
            {companies.map((company) => <option key={company.id} value={company.wazoTenantUuid || ''}>{company.name}</option>)}
          </select>
        </div>
        {feedback && <div role="status" className="flex items-center gap-2 rounded-xl bg-success-background p-4 text-sm text-success"><CheckCircle2 size={18} />{feedback}</div>}
        {formError && <div role="alert" className="rounded-xl bg-danger-background p-4 text-sm text-danger">{formError}</div>}
        {ivrsQuery.isError && <ErrorBox error={ivrsQuery.error} />}
        {didsQuery.isError && <ErrorBox error={didsQuery.error} />}
        {internalError && <ErrorBox error={internalError} />}

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-5 rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-cream p-3 text-primary"><Workflow size={21} /></div>
              <div><h2 className="text-lg font-bold text-primary">Internal IVR routes</h2><p className="mt-1 text-sm text-muted">Employees dial a test extension (7000–7999) to reach an IVR.</p></div>
            </div>
            {canManage && <form onSubmit={submitInternal} className="space-y-3">
              <label className="block text-sm font-semibold text-primary">IVR menu
                <select required value={testIvrId} onChange={(event) => setTestIvrId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-white p-3 text-primary">
                  {ivrs.length === 0 && <option value="">Create an IVR first</option>}
                  {ivrs.map((ivr) => <option key={ivr.id} value={ivr.id}>{ivr.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-primary">Test extension
                <input value={testExtension} onChange={(event) => setTestExtension(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="7001" inputMode="numeric" maxLength={4} className="mt-2 w-full rounded-xl border border-border p-3 text-primary" />
              </label>
              {addInternal.isError && <ErrorBox error={addInternal.error} />}
              {removeInternal.isError && <ErrorBox error={removeInternal.error} />}
              <button type="submit" disabled={addInternal.isPending || !ivrs.length || !testExtension} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Plus size={17} /> {addInternal.isPending ? 'Saving...' : 'Add internal route'}</button>
            </form>}
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-bold text-primary">Configured test extensions</h3>
              {(ivrsQuery.isPending || internalLoading) && <p className="text-sm text-muted">Loading internal routes...</p>}
              {!internalLoading && internalRoutes.length === 0 && <p className="text-sm text-muted">No internal test routes configured.</p>}
              {internalRoutes.map((route) => <div key={`${route.ivrId}:${route.extension}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div><p className="font-semibold text-primary">{route.extension} <ArrowRight size={15} className="inline" /> {getIvrName(ivrs, route.ivrId)}</p><p className="mt-1 text-xs text-muted">{route.active ? 'Active in Asterisk' : 'Not verified active'} · {route.context}</p></div>
                {canManage && <button type="button" aria-label={`Remove routes for ${route.ivrId}`} disabled={removeInternal.isPending} onClick={() => confirmRemove(route)} className="rounded-lg border border-danger/20 p-2 text-danger hover:bg-danger-background disabled:opacity-50"><Trash2 size={17} /></button>}
              </div>)}
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-cream p-3 text-primary"><PhoneIncoming size={21} /></div>
              <div><h2 className="text-lg font-bold text-primary">Local incoming DID routing</h2><p className="mt-1 text-sm text-muted">Create a simulated incoming number and route it to an IVR.</p></div>
            </div>
            {canManage && <form onSubmit={submitDid} className="space-y-3">
              <label className="block text-sm font-semibold text-primary">Destination IVR
                <select required value={didIvrId} onChange={(event) => setDidIvrId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-white p-3 text-primary">
                  {ivrs.length === 0 && <option value="">Create an IVR first</option>}
                  {ivrs.map((ivr) => <option key={ivr.id} value={ivr.id}>{ivr.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-primary">Local test DID
                <input value={testDid} onChange={(event) => setTestDid(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="90000001" inputMode="numeric" maxLength={8} className="mt-2 w-full rounded-xl border border-border p-3 text-primary" />
              </label>
              {createDid.isError && <ErrorBox error={createDid.error} />}
              {activateDid.isError && <ErrorBox error={activateDid.error} />}
              <button type="submit" disabled={createDid.isPending || !ivrs.length || !testDid} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Plus size={17} /> {createDid.isPending ? 'Provisioning...' : 'Create local DID route'}</button>
            </form>}
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-bold text-primary">Configured local test DIDs</h3>
              {didsQuery.isPending && <p className="text-sm text-muted">Loading local DIDs...</p>}
              {!didsQuery.isPending && dids.length === 0 && <p className="text-sm text-muted">No local DID routes configured.</p>}
              {dids.map((item) => <div key={item.incallId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div><p className="font-semibold text-primary">{item.did} <ArrowRight size={15} className="inline" /> {getIvrName(ivrs, Number(item.destination?.ivr_id))}</p><p className="mt-1 text-xs text-muted">Incall #{item.incallId} · Local test only · Carrier not connected</p></div>
                {canManage && <button type="button" disabled={activateDid.isPending} onClick={() => { setFeedback(''); activateDid.mutate(item.incallId); }} className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-primary hover:bg-cream disabled:opacity-50">{activateDid.isPending && activateDid.variables === item.incallId ? 'Activating...' : 'Activate / verify'}</button>}
              </div>)}
            </div>
          </section>
        </div>
        <p className="text-sm text-muted">Internal IVR routes and local DIDs are separate. Creating an internal route does not provision a public phone number. The current backend supports local DID → IVR only, not DID → employee or DID → queue.</p>
      </>}
    </div>
  );
}
