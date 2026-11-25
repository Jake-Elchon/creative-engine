import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';

export function NotFoundPage() {
  const { t } = useLanguage();

  return (
    <section
      className="zibi-container pattern-ndop"
      style={{
        paddingBlock: 'var(--space-20)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-5xl)',
          fontWeight: 'var(--font-extrabold)',
          color: 'var(--color-gold)',
          lineHeight: 1,
        }}
      >
        {t.notFound.code}
      </span>
      <h1 style={{ fontSize: 'var(--text-3xl)' }}>{t.notFound.title}</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '42ch' }}>
        {t.notFound.subtitle}
      </p>
      <Link to="/" style={{ marginTop: 'var(--space-2)' }}>
        <Button variant="primary" leftIcon={<Compass size={16} />}>
          {t.notFound.cta}
        </Button>
      </Link>
    </section>
  );
}
