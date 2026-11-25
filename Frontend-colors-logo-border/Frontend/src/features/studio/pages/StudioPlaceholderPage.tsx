import { Disc3, Store, Users } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { StudioPageIntro } from '@/features/studio/components/StudioPageIntro';

export type StudioSection = 'storefront' | 'products' | 'collaborations';

export function StudioPlaceholderPage({ section }: { section: StudioSection }) {
  const { t } = useLanguage();

  const copy =
    section === 'storefront'
      ? {
          title: t.studio.storefrontTitle,
          description: t.studio.storefrontPlaceholder,
          icon: <Store size={26} />,
        }
      : section === 'products'
        ? {
            title: t.studio.productsTitle,
            description: t.studio.productsPlaceholder,
            icon: <Disc3 size={26} />,
          }
        : {
            title: t.studio.collaborationsTitle,
            description: t.studio.collaborationsPlaceholder,
            icon: <Users size={26} />,
          };

  return (
    <div className="studio-placeholder-page">
      <StudioPageIntro
        eyebrow={t.studio.workspaceLabel}
        title={copy.title}
        description={copy.description}
      />
      <section className="studio-empty" aria-label={copy.title}>
        <div className="studio-empty__icon" aria-hidden="true">{copy.icon}</div>
        <h2>{t.studio.preparationTitle}</h2>
        <p>{t.studio.preparationDescription}</p>
      </section>
    </div>
  );
}
