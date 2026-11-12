'use client';
import { useId, useState } from 'react';

export function FileDropZone({
  file,
  busy,
  onFile,
}: {
  file: File | null;
  busy: boolean;
  onFile: (file: File | null) => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  function choose(files: File[]) {
    if (busy) return;
    const next = files[0];
    const message =
      files.length !== 1
        ? 'Choose one statement file.'
        : !/\.(csv|xlsx)$/i.test(next.name)
          ? 'Choose a CSV or XLSX file.'
          : next.size > 10 * 1024 * 1024
            ? 'Maximum file size is 10 MB.'
            : next.size === 0
              ? 'This file is empty.'
              : '';
    setError(message);
    onFile(message ? null : next);
  }
  return (
    <div
      className={`file-drop-zone ${dragging ? 'dragging' : ''}`}
      aria-busy={busy}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        choose(Array.from(event.dataTransfer.files));
      }}
    >
      <label htmlFor={id}>Drag &amp; drop a file, or browse files</label>
      <p>CSV or XLSX · Maximum 10 MB</p>
      <input
        id={id}
        type="file"
        accept=".csv,.xlsx"
        disabled={busy}
        onChange={(event) => {
          choose(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <p aria-live="polite">
        {busy ? 'Processing statement…' : (file?.name ?? 'No file selected')}
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
