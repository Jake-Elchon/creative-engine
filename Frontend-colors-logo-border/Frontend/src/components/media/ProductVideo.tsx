import { useState } from 'react';

interface ProductVideoProps {
  src: string;
  label: string;
  errorLabel: string;
  preload?: 'none' | 'metadata';
}

export function ProductVideo({ src, label, errorLabel, preload = 'none' }: ProductVideoProps) {
  const [failedSource, setFailedSource] = useState<string>();
  return (
    <>
      <video src={src} controls playsInline preload={preload} aria-label={label}
        onError={() => setFailedSource(src)} style={{ width: '100%', display: 'block' }} />
      {failedSource === src && <p role="alert">{errorLabel}</p>}
    </>
  );
}
