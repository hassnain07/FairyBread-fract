import { Check, ExternalLink, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { dataClient } from '../../../lib/data/client';

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      setError('');
    },
    onError: (e: Error) => setError(e.message),
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

export function AdminSettingsPage() {
  const [prefs, setPrefs] = useState({ newBookings: true, cancellations: true, payments: true, reports: false, reminders: true });
  const labels: Record<string, string> = { newBookings: 'New bookings', cancellations: 'Cancellations', payments: 'Payment activity', reports: 'Weekly report summary', reminders: 'Session reminders' };

  const { data: docs = {} } = useQuery({
    queryKey: ['documents'],
    queryFn: () => dataClient.getDocuments(),
  });

  return (
    <div className="page-stack narrow-page">
      <div className="card settings-card">
        <div className="card-heading"><div><span className="label">Business details</span><h3>Tutoring business information</h3></div></div>
        <div className="settings-form">
          <label>Business name<input defaultValue="Fairybread & Fractions" /></label>
          <label>Contact name<input defaultValue="Therese Howard" /></label>
          <label>Contact email<input defaultValue="hello@fairybreadandfractions.com" /></label>
          <label>Phone<input defaultValue="(02) 4000 1234" /></label>
        </div>
      </div>
      <div className="card settings-card">
        <div className="card-heading"><div><span className="label">Documents</span><h3>Terms &amp; Conditions and Privacy Policy</h3></div></div>
        <div className="settings-doc-list">
          {DOCS.map(d => (
            <DocumentRow key={d.key} docKey={d.key} label={d.label} hint={d.hint} url={docs[d.key]} />
          ))}
        </div>
      </div>
      <div className="card settings-card">
        <div className="card-heading"><div><span className="label">Notification preferences</span><h3>What should we tell you about?</h3></div></div>
        <div className="toggle-list">
          {Object.keys(prefs).map(key => (
            <Toggle key={key} on={prefs[key as keyof typeof prefs]} onToggle={() => setPrefs(p => ({ ...p, [key]: !p[key as keyof typeof prefs] }))} label={labels[key]} sublabel={prefs[key as keyof typeof prefs] ? 'On' : 'Off'} />
          ))}
        </div>
      </div>
      <Button icon={Check}>Save changes</Button>
    </div>
  );
}
