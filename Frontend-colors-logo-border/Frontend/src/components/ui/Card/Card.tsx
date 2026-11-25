import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  children: ReactNode;
}

export function Card({
  interactive = false,
  children,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={`zibi-card ${interactive ? 'zibi-card--interactive' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
