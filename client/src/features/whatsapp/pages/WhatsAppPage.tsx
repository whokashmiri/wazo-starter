import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { whatsappApi, type WaChannel, type WaConversationPage, type WhatsAppApiError } from '../api/whatsapp.api';
import './whatsapp.css';

type Tab = 'overview' | 'connection' | 'departments' | 'members' | 'conversations';
const TABS: { id: Tab; title: string }[] = [
  { id: 'overview', title: 'Overview' }, { id: 'connection', title: 'Connection' },
  { id: 'departments', title: 'Departments' }, { id: 'members', title: 'Team members' },
  { id: 'conversations', title: 'Conversations' },
];
const defaultConnect = { phoneNumberId: '', wabaId: '', accessToken: '', displayNumber: '' };
const cleanNumber = (value: string) => value.replace(/[\s()+-]/g, '');
function message(error: unknown): string { return error instanceof Error ? error.message : 'Unexpected error'; }

export default function WhatsAppPage({ organizationId }: { organizationId: string }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [channels, setChannels] = useState<WaChannel[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connect, setConnect] = useState(defaultConnect);
  const [showToken, setShowToken] = useState(false);
  const [department, setDepartment] = useState({ externalDepartmentId: '', code: '' });
  const [member, setMember] = useState({ wazoUserId: '', departmentCode: '', personalWhatsApp: '', optedIn: false });
  const [conversationPage, setConversationPage] = useState<WaConversationPage | null>(null);
  const [page, setPage] = useState(1);
  const [reloadConversations, setReloadConversations] = useState(0);
  const [conversationsError, setConversationsError] = useState('');
  const channel = useMemo(() => channels.find(c => c.id === selectedId) || null, [channels, selectedId]);

  const refresh = useCallback(async () => {
    if (!organizationId) { setError('An organization must be selected before using WhatsApp.'); setLoading(false); return; }
    try {
      const data = await whatsappApi.listChannels(organizationId);
      setChannels(data);
      setSelectedId(current => data.some(c => c.id === current) ? current : (data[0]?.id || ''));
      setError('');
    } catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, [organizationId]);
  useEffect(() => { setLoading(true); setChannels([]); setSelectedId(''); void refresh(); }, [refresh]);

  useEffect(() => {
    if (tab !== 'conversations' || !channel) return;
    let active = true;
    setConversationsError('');
    setConversationPage(null);
    void whatsappApi.listConversations(organizationId, channel.id, page)
      .then(data => { if (active) setConversationPage(data); })
      .catch((e: unknown) => {
        if (!active) return;
        setConversationsError((e as WhatsAppApiError)?.status === 404
          ? 'The optional conversations API is not installed yet. See backend-patch/ in the package.' : message(e));
      });
    return () => { active = false; };
  }, [tab, channel, organizationId, page, reloadConversations]);

  async function submit(e: FormEvent, action: () => Promise<unknown>, success: string) {
    e.preventDefault(); setBusy(true); setNotice(''); setError('');
    try { await action(); setNotice(success); await refresh(); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  const deptCount = channel?.departments?.length ?? 0;
  const memberCount = channel?.members?.filter(m => m.enabled)?.length ?? 0;
  return (
    <main className="wa-page">
      <header className="wa-heading">
        <div><span className="wa-eyebrow">COMMUNICATION CHANNELS</span><h1>WhatsApp Business</h1><p>Connect your business number, map Wazo departments, and distribute inquiries to team members.</p></div>
        <button type="button" className="wa-btn wa-btn-light" onClick={() => void refresh()} disabled={busy || loading}>↻ Refresh</button>
      </header>
      <div className="wa-topbar">
        <div className="wa-channel-chooser"><label htmlFor="wa-channel">Business number</label><select id="wa-channel" value={selectedId} onChange={e => { setSelectedId(e.target.value); setPage(1); }} disabled={loading || !channels.length}>
          {channels.length ? channels.map(c => <option key={c.id} value={c.id}>{c.displayNumber || c.phoneNumberId}</option>) : <option value="">No number connected</option>}
        </select></div>
        <span className={`wa-status ${channel?.enabled ? 'wa-active' : ''}`}>{channel?.enabled ? '● Configured' : '○ Not connected'}</span>
      </div>
      <nav className="wa-tabs" aria-label="WhatsApp sections">{TABS.map(t => <button key={t.id} type="button" className={tab === t.id ? 'wa-current' : ''} onClick={() => setTab(t.id)}>{t.title}</button>)}</nav>
      {error && <div className="wa-alert wa-alert-error" role="alert">{error}</div>}
      {notice && <div className="wa-alert wa-alert-ok" role="status">{notice}</div>}
      {loading ? <div className="wa-panel">Loading WhatsApp settings…</div> : <>
        {tab === 'overview' && <>
          <div className="wa-metrics">
            <div className="wa-metric"><span>Business numbers</span><strong>{channels.length}</strong><small>Registered connections</small></div>
            <div className="wa-metric"><span>Departments</span><strong>{deptCount}</strong><small>Mapped Wazo queues</small></div>
            <div className="wa-metric"><span>Team members</span><strong>{memberCount}</strong><small>Enabled recipients</small></div>
          </div>
          <section className="wa-panel"><h2>How message distribution works</h2><p>Customers message your official WhatsApp number, select a department, and the matching opted-in employees receive individual WhatsApp notifications.</p>
            <div className="wa-process"><span>Customer</span><b>→</b><span>Meta Cloud API</span><b>→</b><span>Wazo department</span><b>→</b><span>Personal WhatsApp</span></div>
            <p className="wa-muted">The first employee to claim a ticket can reply from their personal WhatsApp through the backend relay. Messages still appear to the customer from the company number, not the employee's number.</p>
          </section>
          <section className="wa-panel"><h2>Setup checklist</h2><ul className="wa-checks"><li>{channel ? '✓' : '○'} Connect a Meta WhatsApp Business number</li><li>{deptCount ? '✓' : '○'} Map Wazo departments (optional)</li><li>{memberCount ? '✓' : '○'} Add opted-in employees</li><li>○ Configure Meta webhook and approved notification template</li><li>○ Verify real message delivery and worker operation</li></ul></section>
        </>}
        {tab === 'connection' && <div className="wa-two-cols">
          <section className="wa-panel"><h2>Connect WhatsApp number</h2><p className="wa-muted">Enter credentials from Meta Business Platform. Tokens are sent to your server and must be encrypted there.</p>
            <form onSubmit={e => void submit(e, async () => {
              await whatsappApi.connect(organizationId, { ...connect, phoneNumberId: connect.phoneNumberId.trim(), wabaId: connect.wabaId.trim(), displayNumber: connect.displayNumber.trim() });
              setConnect(defaultConnect);
            }, 'WhatsApp number configuration saved.')}>
              <label>Phone Number ID<input required inputMode="numeric" pattern="[0-9]{5,30}" placeholder="Meta Phone Number ID" value={connect.phoneNumberId} onChange={e => setConnect({ ...connect, phoneNumberId: e.target.value })}/></label>
              <label>WhatsApp Business Account ID<input required inputMode="numeric" pattern="[0-9]{5,30}" placeholder="Meta WABA ID" value={connect.wabaId} onChange={e => setConnect({ ...connect, wabaId: e.target.value })}/></label>
              <label>Business phone number<input placeholder="+966 50 123 4567" value={connect.displayNumber} onChange={e => setConnect({ ...connect, displayNumber: e.target.value })}/></label>
              <label>Meta access token<div className="wa-password"><input required minLength={20} autoComplete="off" type={showToken ? 'text' : 'password'} placeholder="Paste Meta token" value={connect.accessToken} onChange={e => setConnect({ ...connect, accessToken: e.target.value })}/><button type="button" onClick={() => setShowToken(v => !v)}>{showToken ? 'Hide' : 'Show'}</button></div></label>
              <button className="wa-btn wa-btn-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save connection'}</button>
            </form>
          </section>
          <aside className="wa-panel"><h2>Current connection</h2>{channel ? <dl className="wa-details"><dt>Display number</dt><dd>{channel.displayNumber || 'Not specified'}</dd><dt>Phone Number ID</dt><dd>{channel.phoneNumberId}</dd><dt>Business Account ID</dt><dd>{channel.wabaId}</dd><dt>Status</dt><dd>{channel.enabled ? 'Enabled' : 'Disabled'}</dd></dl> : <p>No number has been connected for this organization.</p>}<div className="wa-note">Meta webhook URL: <code>/api/whatsapp/webhook</code>. The webhook is configured once at platform level, not on each employee phone.</div><p className="wa-muted">Saving credentials does not itself verify ownership or webhook delivery. Production onboarding requires Meta asset verification.</p></aside>
        </div>}
        {tab === 'departments' && <div className="wa-two-cols">
          <section className="wa-panel"><h2>Map a Wazo department</h2><p className="wa-muted">Uses the existing Wazo queue ID. The backend verifies that the queue belongs to this organization.</p>
            <form onSubmit={e => void submit(e, async () => { if (!channel) throw new Error('Connect a WhatsApp number first.'); await whatsappApi.registerDepartment(organizationId, { channelId: channel.id, externalDepartmentId: department.externalDepartmentId.trim(), code: department.code.trim().toLowerCase() }); setDepartment({ externalDepartmentId: '', code: '' }); }, 'Department mapped to WhatsApp.')}>
              <label>Wazo queue ID<input required pattern="[0-9]+" inputMode="numeric" placeholder="e.g. 24" value={department.externalDepartmentId} onChange={e => setDepartment({ ...department, externalDepartmentId: e.target.value })}/></label>
              <label>Department code<input required maxLength={30} pattern="[a-z0-9_-]+" placeholder="sales" value={department.code} onChange={e => setDepartment({ ...department, code: e.target.value.toLowerCase() })}/></label>
              <button className="wa-btn wa-btn-primary" type="submit" disabled={!channel || busy}>{busy ? 'Saving…' : 'Add department'}</button>
            </form>
          </section>
          <section className="wa-panel"><h2>Connected departments</h2>{channel?.departments?.length ? <div className="wa-table-scroll"><table><thead><tr><th>Name</th><th>Code</th><th>Wazo queue</th></tr></thead><tbody>{channel.departments.map(d => <tr key={d.id}><td>{d.name}</td><td>{d.code}</td><td>{d.externalDepartmentId}</td></tr>)}</tbody></table></div> : <p className="wa-muted">No departments mapped. You can still register company-wide team members.</p>}</section>
        </div>}
        {tab === 'members' && <div className="wa-two-cols">
          <section className="wa-panel"><h2>Add employee recipient</h2><p className="wa-muted">The backend verifies the Wazo employee belongs to this tenant and, when selected, the specified department.</p>
            <form onSubmit={e => void submit(e, async () => {
              if (!channel) throw new Error('Connect a WhatsApp number first.');
              await whatsappApi.registerMember(organizationId, { channelId: channel.id, wazoUserId: Number(member.wazoUserId), departmentCode: member.departmentCode || null, personalWhatsApp: cleanNumber(member.personalWhatsApp), optedIn: member.optedIn });
              setMember({ wazoUserId: '', departmentCode: '', personalWhatsApp: '', optedIn: false });
            }, 'Employee WhatsApp recipient saved.')}>
              <label>Wazo employee ID<input required inputMode="numeric" pattern="[1-9][0-9]*" placeholder="e.g. 100" value={member.wazoUserId} onChange={e => setMember({ ...member, wazoUserId: e.target.value })}/></label>
              <label>Personal WhatsApp<input required type="tel" placeholder="966501234567" value={member.personalWhatsApp} onChange={e => setMember({ ...member, personalWhatsApp: e.target.value })}/></label>
              <label>Destination department<select value={member.departmentCode} onChange={e => setMember({ ...member, departmentCode: e.target.value })}><option value="">Default company team (no department)</option>{channel?.departments?.filter(d => d.enabled).map(d => <option key={d.id} value={d.code}>{d.name}</option>)}</select></label>
              <label className="wa-consent"><input type="checkbox" checked={member.optedIn} onChange={e => setMember({ ...member, optedIn: e.target.checked })}/><span>I confirm the employee has agreed to receive business WhatsApp notifications on this number.</span></label>
              <button className="wa-btn wa-btn-primary" type="submit" disabled={!channel || !member.optedIn || busy}>{busy ? 'Saving…' : 'Add recipient'}</button>
            </form>
          </section>
          <section className="wa-panel"><h2>Team recipients</h2>{channel?.members?.length ? <div className="wa-table-scroll"><table><thead><tr><th>Wazo user</th><th>WhatsApp</th><th>Team</th><th>Status</th></tr></thead><tbody>{channel.members.map(m => <tr key={m.id}><td>#{m.wazoUserId}</td><td>{m.phone}</td><td>{m.departmentCode || 'Default'}</td><td>{m.enabled && m.optedIn ? 'Enabled' : 'Inactive'}</td></tr>)}</tbody></table></div> : <p className="wa-muted">No employee WhatsApp numbers added yet.</p>}<div className="wa-note">Current backend records the administrator's opt-in assertion. A verifiable employee consent flow is needed before production.</div></section>
        </div>}
        {tab === 'conversations' && <section className="wa-panel"><div className="wa-inline-title"><div><h2>Customer conversations</h2><p className="wa-muted">Read-only monitoring. Reply commands currently happen from employee personal WhatsApp.</p></div><button className="wa-btn wa-btn-light" onClick={() => setReloadConversations(v => v + 1)} type="button">↻ Refresh</button></div>
          {!channel ? <p className="wa-muted">Connect a number to see conversations.</p> : conversationsError ? <div className="wa-alert wa-alert-error">{conversationsError}</div> : !conversationPage ? <p className="wa-muted">Loading conversations…</p> : conversationPage.items.length ? <><div className="wa-table-scroll"><table><thead><tr><th>Customer</th><th>Department</th><th>Status</th><th>Assigned Wazo user</th><th>Last updated</th></tr></thead><tbody>{conversationPage.items.map(c => <tr key={c.id}><td>{c.customerPhone}</td><td>{c.departmentCode || 'Unassigned'}</td><td>{c.status}</td><td>{c.assignedWazoUserId ?? '—'}</td><td>{new Date(c.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div><div className="wa-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} · {conversationPage.total} total</span><button disabled={page * conversationPage.pageSize >= conversationPage.total} onClick={() => setPage(p => p + 1)}>Next</button></div></> : <p className="wa-muted">No conversations yet. Check Meta webhook subscription and worker status.</p>}
        </section>}
      </>}
    </main>
  );
}
