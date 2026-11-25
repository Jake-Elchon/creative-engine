import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import './EmptyState.css';

export interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, subtitle, icon, action }: EmptyStateProps) {
  return (
    <div className="zibi-state-box">
      <div className="zibi-state-box__icon">{icon || <Sparkles size={24} />}</div>
      <h3 className="zibi-state-box__title">{title}</h3>
      {subtitle && <p className="zibi-state-box__subtitle">{subtitle}</p>}
      {action && <div className="zibi-state-box__action">{action}</div>}
    </div>
  );
}
