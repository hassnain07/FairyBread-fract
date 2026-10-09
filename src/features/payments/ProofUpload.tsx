import { Check, FileText, Upload } from 'lucide-react';

const MAX = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export function validateProof(f: File): string | null {
  if (!OK_TYPES.includes(f.type)) return 'Please upload a JPG, PNG, WebP, HEIC or PDF.';
  if (f.size > MAX) return 'That file is over 10 MB. Please choose a smaller one.';
  return null;
}

interface ProofUploadProps {
  file: File | null;
  onChange: (f: File | null) => void;
  error?: string;
}

export function ProofUpload({ file, onChange, error }: ProofUploadProps) {
  function handleClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) onChange(f);
    };
    input.click();
  }

  if (file) {
    return (
      <div className="upload-attached">
        <div className="upload-file-info">
          <FileText size={20} />
          <div><strong>{file.name}</strong><span>Attached · ready to submit</span></div>
          <Check size={18} className="teal-text" />
        </div>
        <button className="upload-remove" onClick={() => onChange(null)}>Remove file</button>
        {error && <p className="auth-error" style={{ marginTop: 6 }}>{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="upload-area" onClick={handleClick}>
        <Upload size={28} />
        <strong>Drag &amp; drop or click to upload</strong>
        <span>JPG, PNG, WebP, HEIC or PDF · up to 10 MB</span>
      </div>
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}
