import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import type { PaymentRailOption } from '@/types/models';

export interface PaymentRailSelectorProps {
  value: PaymentRailOption;
  onChange: (rail: PaymentRailOption) => void;
  disabled?: boolean;
}

export function PaymentRailSelector({
  value,
  onChange,
  disabled = false,
}: PaymentRailSelectorProps) {
  const { t } = useLanguage();

  const options: Array<{ id: PaymentRailOption; label: string }> = [
    { id: 'auto', label: t.checkout.railAuto },
    { id: 'mtn', label: t.checkout.railMtn },
    { id: 'orange', label: t.checkout.railOrange },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span className="zibi-field__label">{t.checkout.railLabel}</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        {options.map((opt) => (
          <Button
            key={opt.id}
            type="button"
            size="sm"
            disabled={disabled}
            variant={
              value === opt.id
                ? opt.id === 'orange'
                  ? 'primary'
                  : 'gold'
                : 'secondary'
            }
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
