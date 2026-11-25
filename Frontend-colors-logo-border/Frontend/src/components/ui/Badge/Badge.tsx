import type { ReactNode } from 'react';
import './Badge.css';

export type BadgeVariant = 'neutral' | 'gold' | 'terracotta' | 'forest' | 'indigo';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`zibi-badge zibi-badge--${variant} ${className}`}>
      {children}
    </span>
  );
}
