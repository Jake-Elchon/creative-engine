import { ArrowRight, Disc3, Store, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { StudioPageIntro } from '@/features/studio/components/StudioPageIntro';

export function StudioDashboardPage() {
  const { t } = useLanguage();

  return (
    <div className="studio-overview">
      <StudioPageIntro
        eyebrow={t.studio.overviewEyebrow}
        title={t.studio.overviewTitle}
        description={t.studio.overviewDescription}
      />

      <section className="studio-featured" aria-labelledby="studio-storefront-entry">
        <div className="studio-featured__pattern" aria-hidden="true" />
        <div className="studio-featured__icon"><Store size={24} /></div>
        <div className="studio-featured__copy">
          <span>{t.studio.storefrontEntryLabel}</span>
          <h2 id="studio-storefront-entry">{t.studio.storefrontEntryTitle}</h2>
          <p>{t.studio.storefrontEntryDescription}</p>
        </div>
        <Link className="studio-featured__link" to="/studio/storefront">
          {t.studio.openStorefront}
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="studio-workspace-grid" aria-label={t.studio.managementLabel}>
        <Link className="studio-workspace-row" to="/studio/products">
          <span className="studio-workspace-row__icon studio-workspace-row__icon--gold">
            <Disc3 size={20} />
          </span>
          <div>
            <h2>{t.studio.productsTitle}</h2>
            <p>{t.studio.productsEntryDescription}</p>
          </div>
          <ArrowRight className="studio-workspace-row__arrow" size={18} />
        </Link>

        <Link className="studio-workspace-row" to="/studio/collaborations">
          <span className="studio-workspace-row__icon studio-workspace-row__icon--forest">
            <Users size={20} />
          </span>
          <div>
            <h2>{t.studio.collaborationsTitle}</h2>
            <p>{t.studio.collaborationsEntryDescription}</p>
          </div>
          <ArrowRight className="studio-workspace-row__arrow" size={18} />
        </Link>
      </section>
    </div>
  );
}
