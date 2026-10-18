import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Headphones, Loader2, Play, Plus, Upload, X } from 'lucide-react';
import { companiesApi } from '../../companies/companies.api';
import { getApiErrorMessage } from '../../../api/client';
import { greetingsApi, type GreetingAudio } from '../api/greetings.api';

const EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'wma', 'webm'];

export default function GreetingsPage() {
  const queryClient = useQueryClient();
  const [tenantUuid, setTenantUuid] = useState('');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const companiesQuery = useQuery({ queryKey: ['account', 'companies'], queryFn: companiesApi.listMine });
  const companies = useMemo(() => (companiesQuery.data || []).filter((company) =>
    company.status === 'ACTIVE' && Boolean(company.wazoTenantUuid) &&
    company.memberships.some((member) => member.role === 'COMPANY_ADMIN' || member.role === 'SUPERVISOR')
  ), [companiesQuery.data]);

  useEffect(() => {
    if (tenantUuid && companies.some((company) => company.wazoTenantUuid === tenantUuid)) return;
    setTenantUuid(companies[0]?.wazoTenantUuid || '');
  }, [companies, tenantUuid]);

  const currentCompany = companies.find((company) => company.wazoTenantUuid === tenantUuid);
  const canManage = currentCompany?.memberships.some((member) => member.role === 'COMPANY_ADMIN') ?? false;
  const greetingsQuery = useQuery({
    queryKey: ['ivr-audio', tenantUuid],
    queryFn: () => greetingsApi.list(tenantUuid),
    enabled: Boolean(tenantUuid),
  });
  const uploadMutation = useMutation({
    mutationFn: ({ label, selected }: { label: string; selected: File }) => greetingsApi.upload(tenantUuid, label, selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ivr-audio', tenantUuid] });
      setOpen(false);
      setName('');
      setFile(null);
      setFormError('');
    },
  });
  const previewMutation = useMutation({
    mutationFn: (audioId: string) => greetingsApi.preview(tenantUuid, audioId),
    onSuccess: (blob, audioId) => {
      setPreviewUrl(URL.createObjectURL(blob));
      setPlayingId(audioId);
    },
  });

  // Revoke preview blobs whenever the selected recording changes or component unmounts.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    setPlayingId(null);
    setPreviewUrl(null);
    previewMutation.reset();
  // Changing tenants should clear previous tenant audio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantUuid]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !file) return;
    if (name.trim().length < 2 || name.trim().length > 80) {
      setFormError('Greeting name must contain 2-80 characters.'); return;
    }
    if (!EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() || '')) {
      setFormError('Unsupported audio format.'); return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setFormError('Audio file must be between 1 byte and 10 MB.'); return;
    }
    setFormError('');
    uploadMutation.mutate({ label: name.trim(), selected: file });
  }

  async function preview(audio: GreetingAudio) {
    if (playingId === audio.id) { setPlayingId(null); setPreviewUrl(null); return; }
    setPlayingId(null);
    setPreviewUrl(null);
    previewMutation.mutate(audio.id);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-3xl font-bold text-primary">Greetings &amp; Audio</h2>
        <p className="mt-2 text-sm text-muted-foreground">Upload and preview recorded greetings for your future IVR menus.</p>
      </div>
      {canManage && <button type="button" onClick={() => { uploadMutation.reset(); setFormError(''); setOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90"><Plus size={18} /> Upload greeting</button>}
    </div>

    {companiesQuery.isError && <p role="alert" className="rounded-xl bg-danger-background p-4 text-danger">{getApiErrorMessage(companiesQuery.error)}</p>}
    {companiesQuery.isPending && <p className="text-sm text-muted">Loading companies...</p>}
    {companies.length === 0 && !companiesQuery.isPending && <p className="rounded-xl border border-border bg-white p-6">You need an approved company to use greetings.</p>}
    {companies.length > 0 && <>
      <div className="rounded-2xl border border-border bg-white p-5">
        <label htmlFor="audio-company" className="mb-2 block text-sm font-semibold text-primary">Company</label>
        <select id="audio-company" value={tenantUuid} onChange={(event) => setTenantUuid(event.target.value)} className="w-full max-w-md rounded-xl border border-border bg-white px-4 py-3 text-primary">
          {companies.map((company) => <option key={company.id} value={company.wazoTenantUuid || ''}>{company.name}</option>)}
        </select>
      </div>
      <div className="rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><h3 className="font-bold text-primary">Audio library</h3><span className="text-sm text-muted">{greetingsQuery.data?.length ?? 0} greetings</span></div>
        {greetingsQuery.isPending && <p className="p-6 text-sm text-muted"><Loader2 className="mr-2 inline animate-spin" size={16} /> Loading greetings...</p>}
        {greetingsQuery.isError && <p role="alert" className="p-6 text-sm text-danger">{getApiErrorMessage(greetingsQuery.error)}</p>}
        {greetingsQuery.isSuccess && greetingsQuery.data.length === 0 && <div className="flex flex-col items-center gap-2 p-12 text-center"><AudioLines size={32} className="text-muted" /><p className="font-semibold text-primary">No greetings uploaded</p><p className="text-sm text-muted">Upload a welcome message or an after-hours greeting.</p></div>}
        {greetingsQuery.data?.map((audio) => <div key={audio.id} className="flex flex-wrap items-center gap-4 border-b border-border p-5 last:border-0">
          <span className="rounded-xl bg-cream p-3 text-primary"><Headphones size={20} /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold text-primary">{audio.name}</p><p className="truncate text-xs text-muted">{audio.originalName} · {new Date(audio.createdAt).toLocaleDateString()}</p></div>
          <button type="button" onClick={() => preview(audio)} disabled={previewMutation.isPending} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-primary hover:bg-cream disabled:opacity-50"><Play size={16} />{playingId === audio.id ? 'Close preview' : 'Preview'}</button>
          {playingId === audio.id && previewUrl && <div className="w-full"><audio autoPlay controls src={previewUrl} className="w-full" /></div>}
        </div>)}
        {previewMutation.isError && <p role="alert" className="p-5 text-sm text-danger">{getApiErrorMessage(previewMutation.error)}</p>}
      </div>
    </>}

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="greeting-dialog-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between"><h3 id="greeting-dialog-title" className="text-xl font-bold text-primary">Upload greeting</h3><button type="button" aria-label="Close" disabled={uploadMutation.isPending} onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-cream"><X size={20} /></button></div>
      <form onSubmit={submit} className="space-y-5">
        <div><label htmlFor="greeting-name" className="mb-2 block text-sm font-semibold text-primary">Greeting name</label><input id="greeting-name" required maxLength={80} minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Welcome message" className="w-full rounded-xl border border-border px-4 py-3 text-primary" /></div>
        <div><label htmlFor="greeting-file" className="mb-2 block text-sm font-semibold text-primary">Audio file</label><input id="greeting-file" type="file" required accept=".mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.opus,.wma,.webm" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-border p-3 text-sm text-primary" /><p className="mt-2 text-xs text-muted">Max 10 MB. Output: mono 8 kHz WAV, up to 120 seconds.</p></div>
        {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
        {uploadMutation.isError && <p role="alert" className="text-sm text-danger">{getApiErrorMessage(uploadMutation.error)}</p>}
        <button type="submit" disabled={uploadMutation.isPending || !file} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-50">{uploadMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />} {uploadMutation.isPending ? 'Converting and saving...' : 'Upload greeting'}</button>
      </form>
    </div></div>}
  </div>;
}
