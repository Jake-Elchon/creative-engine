import { useLanguage } from '@/app/providers/LanguageProvider';
import './LoadingIndicator.css';

export function LoadingIndicator({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="zibi-loader" role="status" aria-live="polite">
      <span className="zibi-loader__diamond" aria-hidden="true" />
      <span>{label || t.common.loading}</span>
    </div>
  );
}
