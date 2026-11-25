import { useLanguage } from '@/app/providers/LanguageProvider';
import { BorderStrip } from '@/components/brand/BorderStrip';
import { ZibiWordmark } from '@/components/brand/ZibiLogo';
import './Footer.css';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="zibi-footer">
      <BorderStrip />
      <div className="zibi-container zibi-footer__inner">
        <div>
          <ZibiWordmark className="zibi-footer__wordmark" />
          <p className="zibi-footer__meta">{t.common.tagline}</p>
        </div>
        <p className="zibi-footer__meta">
          © {new Date().getFullYear()} Zibi · KamerPay Studio
        </p>
      </div>
    </footer>
  );
}
