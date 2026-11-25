import './Skeleton.css';

export interface SkeletonProps {
  width?: string;
  height?: string;
  circle?: boolean;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '16px',
  circle = false,
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`zibi-skeleton ${circle ? 'zibi-skeleton--circle' : ''} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
