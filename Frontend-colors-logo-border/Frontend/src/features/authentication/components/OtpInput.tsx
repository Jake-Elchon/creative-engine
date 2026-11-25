import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import './OtpInput.css';

export interface OtpInputProps {
  value: string;
  onChange: (nextCode: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export function OtpInput({
  value,
  onChange,
  disabled = false,
  hasError = false,
}: OtpInputProps) {
  const { formatMessage, t } = useLanguage();
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const setDigitAt = (index: number, char: string) => {
    const next = [...digits];
    next[index] = char;
    onChange(next.join(''));
  };

  const handleChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigitAt(index, '');
      return;
    }

    if (cleaned.length > 1) {
      const sliced = cleaned.slice(0, 6);
      onChange(sliced);
      const focusIdx = Math.min(sliced.length, 5);
      inputsRef.current[focusIdx]?.focus();
      return;
    }

    setDigitAt(index, cleaned);
    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      setDigitAt(index - 1, '');
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputsRef.current[focusIdx]?.focus();
  };

  return (
    <div className="zibi-otp-group">
      <span className="zibi-field__label">{t.auth.otpLabel}</span>
      <div className="zibi-otp-boxes">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            disabled={disabled}
            aria-label={formatMessage(t.auth.otpDigitLabel, { index: index + 1 })}
            className={`zibi-otp-box ${hasError ? 'zibi-otp-box--error' : ''}`}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
    </div>
  );
}
