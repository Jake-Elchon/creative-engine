import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './Input.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightSlot,
  id,
  className = '',
  ...rest
}: InputProps) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const feedbackId = useId();
  const descriptions = [rest['aria-describedby'], error || hint ? feedbackId : undefined].filter(Boolean).join(' ');

  return (
    <div className={`zibi-field ${className}`}>
      {label && (
        <div className="zibi-field__label-row">
          <label className="zibi-field__label" htmlFor={inputId}>
            {label}
          </label>
        </div>
      )}
      <div
        className={`zibi-field__control ${error ? 'zibi-field__control--error' : ''}`}
      >
        {leftIcon && <span className="zibi-field__icon">{leftIcon}</span>}
        <input
          id={inputId}
          className="zibi-field__input"
          aria-invalid={Boolean(error)}
          {...rest}
          aria-describedby={descriptions || undefined}
        />
        {rightSlot && <div className="zibi-field__suffix">{rightSlot}</div>}
      </div>
      {error ? (
        <p id={feedbackId} className="zibi-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={feedbackId} className="zibi-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
