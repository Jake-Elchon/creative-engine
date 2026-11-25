import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { useLanguage } from '@/app/providers/LanguageProvider';
import '../EmptyState/EmptyState.css';

export interface ErrorStateProps {
  title: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
}

export function ErrorState({
  title,
  subtitle,
  onRetry,
  retryLabel,
  icon,
}: ErrorStateProps) {
  const { t } = useLanguage();

  return (
    <div className="zibi-state-box" role="alert">
      <div className="zibi-state-box__icon zibi-state-box__icon--error">
        {icon || <AlertTriangle size={24} />}
      </div>
      <h3 className="zibi-state-box__title">{title}</h3>
      {subtitle && <p className="zibi-state-box__subtitle">{subtitle}</p>}
      {onRetry && (
        <div className="zibi-state-box__action">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel || t.common.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
