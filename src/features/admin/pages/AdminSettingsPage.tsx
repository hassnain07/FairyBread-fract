import { Check, ExternalLink, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';

const DOCS = [
  { key: 'terms', label: 'Terms & Conditions', hint: 'Shown to parents during enrolment.' },
  { key: 'privacy', label: 'Privacy Policy', hint: 'Accessible from the enrolment form.' },
  { key: 'mini_trampoline', label: 'Mini Trampoline Consent Form', hint: 'Shown to parents during enrolment.' },
] as const;

type DocKey = typeof DOCS[number]['key'];

function DocumentRow({ docKey, label, hint, url }: { docKey: DocKey; label: string; hint: string; url?: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const { mutate: upload, isPending } = useMutation({
    mutationFn: (file: File) => dataClient.uploadDocument(docKey, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.documents }); setError(''); },
    onError: (e: Error) => setError(toAppError(e).message),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10 MB.'); return; }
    setError('');
    upload(file);
    e.target.value = '';
  }

  return (
    <div className="settings-doc-row">
      <div className="settings-doc-info">
        <strong>{label}</strong>
        <span className="label">{hint}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="settings-doc-link">
            <ExternalLink size={13} /> View current PDF
          </a>
        )}
        {!url && <span className="settings-doc-none">No document uploaded yet.</span>}
        {error && <span className="auth-error" style={{ marginTop: 4 }}>{error}</span>}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFile} />
      <Button variant="soft" icon={Upload} onClick={() => inputRef.current?.click()} disabled={isPending}>
        {isPending ? 'Uploading…' : url ? 'Replace PDF' : 'Upload PDF'}
      </Button>
    </div>
  );
}

const NOTIF_CATEGORIES = [
  { key: 'new_bookings', label: 'New bookings' },
  { key: 'cancellations', label: 'Cancellations' },
  { key: 'payments', label: 'Payment activity' },
  { key: 'reports', label: 'Weekly report summary' },
  { key: 'reminders', label: 'Session reminders' },
  { key: 'orders', label: 'Shop orders' },
] as const;

export function AdminSettingsPage() {
  const qc = useQueryClient();

  const { data: settings = {} } = useQuery({
    queryKey: qk.settings,
    queryFn: () => dataClient.getSettings(),
  });

  const { data: docs = {} } = useQuery({
    queryKey: qk.documents,
    queryFn: () => dataClient.getDocuments(),
  });

  // ── Business info ────────────────────────────────────────────────────────────
  const business = (settings as any)?.business ?? {};
  const publicInfo = (settings as any)?.public_info ?? {};

  const [bizForm, setBizForm] = useState<Record<string, string> | null>(null);
  const [bizError, setBizError] = useState('');
  const [bizSuccess, setBizSuccess] = useState(false);

  const effectiveBiz = bizForm ?? {
    business_name: business.business_name ?? '',
    contact_name: business.contact_name ?? '',
    contact_email: publicInfo.contact_email ?? '',
    phone: publicInfo.phone ?? '',
    bank_name: publicInfo.bank?.name ?? '',
    bank_bsb: publicInfo.bank?.bsb ?? '',
    bank_account: publicInfo.bank?.account ?? '',
    bank_account_name: publicInfo.bank?.account_name ?? '',
  };

  const { mutate: saveBiz, isPending: savingBiz } = useMutation({
    mutationFn: async (f: Record<string, string>) => {
      await dataClient.updateSetting('business', {
        ...(settings as any)?.business,
        business_name: f.business_name,
        contact_name: f.contact_name,
      });
      await dataClient.updateSetting('public_info', {
        ...(settings as any)?.public_info,
        contact_email: f.contact_email,
        phone: f.phone,
        bank: {
          name: f.bank_name,
          bsb: f.bank_bsb,
          account: f.bank_account,
          account_name: f.bank_account_name,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings });
      setBizForm(null);
      setBizError('');
      setBizSuccess(true);
      setTimeout(() => setBizSuccess(false), 3000);
    },
    onError: (e: Error) => setBizError(toAppError(e).message),
  });

  // ── Notification prefs (stored in settings.notification_preferences) ─────────
  const notifPrefs = (settings as any)?.notification_preferences ?? {};
  const [prefOverrides, setPrefOverrides] = useState<Record<string, boolean>>({});
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefError, setPrefError] = useState('');

  function getPref(key: string): boolean {
    if (key in prefOverrides) return prefOverrides[key];
    return notifPrefs[key] !== false; // default on
  }

  async function savePrefs() {
    setPrefSaving(true);
    setPrefError('');
    try {
      const merged = { ...notifPrefs, ...prefOverrides };
      await dataClient.updateSetting('notification_preferences', merged);
      qc.invalidateQueries({ queryKey: qk.settings });
      setPrefOverrides({});
    } catch (e) {
      setPrefError(toAppError(e as Error).message);
    } finally {
      setPrefSaving(false);
    }
  }

  return (
    <div className="page-stack narrow-page">
      {/* ── Business details ── */}
      <div className="card settings-card">
        <div className="card-heading"><div><span className="label">Business details</span><h3>Tutoring business information</h3></div></div>
        <div className="settings-form">
          <label>
            Business name
            <input
              value={effectiveBiz.business_name}
              onChange={e => setBizForm({ ...effectiveBiz, business_name: e.target.value })}
            />
          </label>
          <label>
            Contact name
            <input
              value={effectiveBiz.contact_name}
              onChange={e => setBizForm({ ...effectiveBiz, contact_name: e.target.value })}
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={effectiveBiz.contact_email}
              onChange={e => setBizForm({ ...effectiveBiz, contact_email: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={effectiveBiz.phone}
              onChange={e => setBizForm({ ...effectiveBiz, phone: e.target.value })}
            />
          </label>
        </div>
        <div className="card-heading" style={{ marginTop: 20 }}><div><span className="label">Bank details</span><h3>Shown on payment screens</h3></div></div>
        <div className="settings-form">
          <label>
            Bank name
            <input
              value={effectiveBiz.bank_name}
              onChange={e => setBizForm({ ...effectiveBiz, bank_name: e.target.value })}
            />
          </label>
          <label>
            BSB
            <input
              value={effectiveBiz.bank_bsb}
              onChange={e => setBizForm({ ...effectiveBiz, bank_bsb: e.target.value })}
              placeholder="e.g. 062 000"
            />
          </label>
          <label>
            Account number
            <input
              value={effectiveBiz.bank_account}
              onChange={e => setBizForm({ ...effectiveBiz, bank_account: e.target.value })}
              placeholder="e.g. 1234 5678"
            />
          </label>
          <label>
            Account name
            <input
              value={effectiveBiz.bank_account_name}
              onChange={e => setBizForm({ ...effectiveBiz, bank_account_name: e.target.value })}
            />
          </label>
        </div>
        {bizError && <div className="auth-error" style={{ marginTop: 8 }}>{bizError}</div>}
        {bizSuccess && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>✓ Saved!</div>}
        <Button
          icon={Check}
          disabled={savingBiz || bizForm === null}
          onClick={() => saveBiz(effectiveBiz)}
          style={{ marginTop: 16 }}
        >
          {savingBiz ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {/* ── Documents ── */}
      <div className="card settings-card">
        <div className="card-heading"><div><span className="label">Documents</span><h3>Terms &amp; Conditions and Privacy Policy</h3></div></div>
        <div className="settings-doc-list">
          {DOCS.map(d => (
            <DocumentRow key={d.key} docKey={d.key} label={d.label} hint={d.hint} url={(docs as any)[d.key]} />
          ))}
        </div>
      </div>

      {/* ── Notification preferences ── */}
      <div className="card settings-card">
        <div className="card-heading"><div><span className="label">Notification preferences</span><h3>What should we tell you about?</h3></div></div>
        <div className="toggle-list">
          {NOTIF_CATEGORIES.map(({ key, label }) => (
            <Toggle
              key={key}
              on={getPref(key)}
              onToggle={() => setPrefOverrides(p => ({ ...p, [key]: !getPref(key) }))}
              label={label}
              sublabel={getPref(key) ? 'On' : 'Off'}
            />
          ))}
        </div>
        {prefError && <div className="auth-error" style={{ marginTop: 8 }}>{prefError}</div>}
        <Button
          icon={Check}
          disabled={prefSaving || Object.keys(prefOverrides).length === 0}
          onClick={savePrefs}
          style={{ marginTop: 16 }}
        >
          {prefSaving ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </div>
  );
}
