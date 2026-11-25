import { ArrowRight, Disc3, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import { MediaContainer } from '@/components/media/MediaContainer';
import { artistStorefrontPath } from '@/features/discovery/artists';
import { formatMoney } from '@/utils/currency';
import { StudioPageIntro } from '../components/StudioPageIntro';
import { studioError, useStudioWorkspace } from '../workspace';

export function StudioDashboardPage() {
  const { t, locale } = useLanguage();
  const copy = t.studioForms;
  const { storefront, inventory, inventoryError, inventoryLoading, loadInventory } = useStudioWorkspace();

  return (
    <div className="studio-overview">
      <StudioPageIntro eyebrow={t.studio.overviewEyebrow} title={t.studio.overviewTitle}
        description={copy.overviewSummary} />

      {inventoryLoading && !inventory && <p role="status">{copy.inventoryLoading}</p>}
      {inventoryError != null && !inventory && <section className="studio-editor__panel" aria-label={copy.myProducts}>
        <p role="alert">{studioError(inventoryError, copy)}</p>
        <Button variant="secondary" onClick={() => void loadInventory()}>{t.common.retry}</Button>
      </section>}

      {inventory && <>
        <section className="studio-featured studio-featured--profile" aria-labelledby="studio-storefront-entry">
          <div className="studio-featured__pattern" aria-hidden="true" />
          {storefront
            ? <MediaContainer alt="" monogram={storefront.displayName} aspectRatio="1x1" />
            : <div className="studio-featured__icon"><Store size={24} aria-hidden="true" /></div>}
          <div className="studio-featured__copy">
            <span>{storefront ? copy.storefrontPublic : t.studio.storefrontEntryLabel}</span>
            <h2 id="studio-storefront-entry">{storefront?.displayName ?? copy.noOwnedStorefront}</h2>
            {storefront
              ? <><p>@{storefront.handle}</p>{storefront.bio && <p>{storefront.bio}</p>}</>
              : <p>{t.studio.storefrontEntryDescription}</p>}
          </div>
          <div className="studio-overview-actions">
            {storefront && <Link className="studio-editor__link" to={artistStorefrontPath(storefront.handle)}>{copy.publicStore}</Link>}
            <Link className="studio-featured__link" to="/studio/storefront">
              {storefront ? t.studio.storefrontNav : copy.createStore} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="studio-inventory" aria-labelledby="studio-my-products">
          <header className="studio-inventory__header">
            <h2 id="studio-my-products">{copy.myProducts}</h2>
            {storefront && <Link className="studio-editor__link" to="/studio/products">{copy.createProduct}</Link>}
          </header>
          {inventory.products.length
            ? <ul className="studio-inventory__list">{inventory.products.map((product) => {
                const ownerStore = inventory.storefronts.find(({ storefrontId }) => storefrontId === product.storefrontId);
                const type = t.productTypes[product.type.code];
                return (
                  <li key={product.productId} className="studio-inventory__row">
                    <Disc3 size={21} aria-hidden="true" />
                    <div className="studio-inventory__identity">
                      <h3>{type}</h3>
                      {product.description && <p>{product.description}</p>}
                      {ownerStore && <p>@{ownerStore.handle}</p>}
                    </div>
                    <div className="studio-inventory__prices">
                      {product.prices.length ? product.prices.map((price) => (
                        <span key={price.priceId}>{formatMoney(price.amountMinor, price.currencyCode, locale)}</span>
                      )) : <span>{t.storefront.unpriced}</span>}
                    </div>
                    <div className="studio-overview-actions">
                      <Link className="studio-editor__link" to={`/studio/products?product=${product.productId}#studio-product-prices`}>{copy.openProduct}</Link>
                      <Link className="studio-editor__link" to={`/studio/collaborations?product=${product.productId}`}>{copy.configureSplit}</Link>
                    </div>
                  </li>
                );
              })}</ul>
            : <p>{storefront ? copy.noOwnedProducts : copy.createStoreToPublish}</p>}
          {inventoryError != null && <p role="alert">{studioError(inventoryError, copy)}</p>}
          {inventory.nextCursor && <Button variant="secondary" isLoading={inventoryLoading} onClick={() => {
            void loadInventory(inventory.nextCursor ?? undefined);
          }}>{inventoryError != null ? t.common.retry : t.common.loadMore}</Button>}
        </section>
      </>}
    </div>
  );
}
