import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Music,
  Share2,
  Sparkles,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { ProductVideo } from '@/components/media/ProductVideo';
import { MediaContainer } from '@/components/media/MediaContainer';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Card } from '@/components/ui/Card/Card';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { Select } from '@/components/ui/Select/Select';
import { Skeleton } from '@/components/ui/Skeleton/Skeleton';
import { CheckoutModal } from '@/features/checkout/components/CheckoutModal';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type {
  StorefrontDetail,
  StorefrontProduct,
  SupportedCurrency,
} from '@/types/models';
import { formatMoney } from '@/utils/currency';
import { checkoutAmount, getDisplayPrice } from '@/features/storefront/catalog';
import { buildStorefrontPublicUrl, normalizeHandle, publicMediaUrl } from '@/utils/url';
import './StorefrontPage.css';

export function StorefrontPage() {
  const { handle: rawHandle } = useParams<{ handle: string }>();
  const cleanHandle = normalizeHandle(rawHandle);
  const { state } = useLocation();
  const backToExplore = { pathname: '/', search: typeof state?.exploreSearch === 'string' ? state.exploreSearch : '' };
  const { locale, t, formatMessage } = useLanguage();
  const { pushToast } = useToast();

  const [storefront, setStorefront] = useState<StorefrontDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);

  const [currency, setCurrency] = useState<SupportedCurrency>('XAF');
  const [copied, setCopied] = useState(false);
  const [openedProductId, setOpenedProductId] = useState<string | null>(null);
  const [checkoutProducts, setCheckoutProducts] = useState<Record<string, StorefrontProduct>>({});
  const activePage = useRef<AbortController | null>(null);

  const loadStorefront = useCallback(
    async (signal?: AbortSignal) => {
      if (!cleanHandle) {
        setError(new ApiClientError({ kind: 'NOT_FOUND', code: 'STOREFRONT_NOT_FOUND', status: 404, message: '' }));
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        const data = await apiClient.getPublicStorefront({
          handle: cleanHandle,
          limit: 12,
          displayCurrency: currency,
          signal,
        });
        if (!signal?.aborted) setStorefront(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiClientError) {
          setError(err);
        } else {
          setError(
            new ApiClientError({
              message: t.storefront.loadErrorSubtitle,
              code: 'UNKNOWN',
              status: 500,
              kind: 'SERVER_ERROR',
              isRetryable: true,
            }),
          );
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [cleanHandle, currency, t.storefront.loadErrorSubtitle],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStorefront(controller.signal);
    return () => {
      controller.abort();
      activePage.current?.abort();
    };
  }, [loadStorefront]);

  const handleCopyUrl = async () => {
    const urlToCopy =
      storefront?.storefront.storefrontUrl || buildStorefrontPublicUrl(cleanHandle);
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      pushToast(t.common.linkCopied, 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast(urlToCopy, 'info');
    }
  };

  const handleShare = async () => {
    if (!storefront) return;
    const shareUrl =
      storefront.storefront.storefrontUrl || buildStorefrontPublicUrl(cleanHandle);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${storefront.storefront.displayName} — Zibi`,
          text: storefront.storefront.bio ?? undefined,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to copy if share sheet dismissed
      }
    }
    await handleCopyUrl();
  };

  const handleLoadMoreProducts = async () => {
    if (!storefront?.nextCursor || activePage.current) return;
    const controller = new AbortController();
    activePage.current = controller;
    setIsLoadingMore(true);
    try {
      const more = await apiClient.getPublicStorefront({
        handle: cleanHandle,
        cursor: storefront.nextCursor,
        limit: 12,
        displayCurrency: currency,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setStorefront((prev) =>
        prev
          ? {
              ...prev,
              products: [...new Map([...prev.products, ...more.products].map((item) => [item.productId, item])).values()],
              nextCursor: more.nextCursor,
            }
          : more,
      );
    } catch {
      if (!controller.signal.aborted) pushToast(t.storefront.loadErrorSubtitle, 'error');
    } finally {
      if (activePage.current === controller) activePage.current = null;
      setIsLoadingMore(false);
    }
  };

  const refreshCheckoutProduct = async (productId: string) => {
    activePage.current?.abort();
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await apiClient.getPublicStorefront({ handle: cleanHandle, displayCurrency: currency, cursor, limit: 50, noStore: true });
      const updated = page.products.find((product) => product.productId === productId);
      if (updated) {
        setStorefront((current) => current && {
          ...current,
          products: current.products.map((product) => product.productId === productId ? updated : product),
        });
        return updated;
      }
      cursor = page.nextCursor ?? undefined;
      if (!cursor || seen.has(cursor)) break;
      seen.add(cursor);
    } while (cursor);
    setStorefront((current) => current && {
      ...current,
      products: current.products.filter((product) => product.productId !== productId),
    });
    return null;
  };

  const renderCatalog = () => {
    if (isLoading) {
      return (
        <div className="zibi-container" style={{ paddingBlock: 'var(--space-10)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <Skeleton height="200px" />
            <div className="zibi-product-grid">
              <Skeleton height="240px" />
              <Skeleton height="240px" />
              <Skeleton height="240px" />
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="zibi-container" style={{ paddingBlock: 'var(--space-12)' }}>
          <ErrorState
            title={
              error.kind === 'NOT_FOUND'
                ? t.storefront.notFoundTitle
                : t.storefront.loadErrorTitle
            }
            subtitle={
              error.kind === 'NOT_FOUND'
                ? formatMessage(t.storefront.notFoundSubtitle, { handle: cleanHandle })
                : t.storefront.loadErrorSubtitle
            }
            onRetry={error.isRetryable ? () => void loadStorefront() : undefined}
          />
          <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
            <Link to={backToExplore}>
              <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}>
                {t.common.backToDiscovery}
              </Button>
            </Link>
          </div>
        </div>
      );
    }

    if (!storefront) return null;

    const { storefront: artist, products } = storefront;
    const publicUrl = artist.storefrontUrl || buildStorefrontPublicUrl(artist.handle);

    return (
      <>
        <section className="zibi-storefront-header pattern-bamileke">
          <div className="zibi-storefront-header__glow" aria-hidden="true" />
          <div className="zibi-container">
            <div style={{ marginBottom: 'var(--space-5)', position: 'relative', zIndex: 1 }}>
              <Link to={backToExplore}>
                <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={14} />}>
                  {t.common.backToDiscovery}
                </Button>
              </Link>
            </div>

            <div className="zibi-storefront-banner">
              <MediaContainer
                alt={artist.displayName}
                aspectRatio="1x1"
                accentTone="gold"
                monogram={artist.displayName}
                priority
              />

              <div className="zibi-storefront-meta">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <Badge variant="gold">
                    <Sparkles size={12} />
                    {t.storefront.creatorLabel}
                  </Badge>
                </div>

                <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, var(--text-4xl))' }}>
                  {artist.displayName}
                </h1>

                <p style={{ color: 'var(--color-gold)', fontWeight: 'var(--font-semibold)' }}>
                  @{normalizeHandle(artist.handle)}
                </p>

                {artist.bio && <p
                  style={{
                    color: 'var(--text-secondary)',
                    maxWidth: '62ch',
                    lineHeight: 'var(--leading-relaxed)',
                  }}
                >
                  {artist.bio}
                </p>}

                <div className="zibi-storefront-url-row">
                  <span className="zibi-storefront-url-pill">
                    <ExternalLink size={12} />
                    {publicUrl}
                  </span>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyUrl}
                    leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}
                  >
                    {copied ? t.common.linkCopied : t.common.copyLink}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShare}
                    leftIcon={<Share2 size={14} />}
                  >
                    {t.common.share}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="zibi-catalog-section">
          <div className="zibi-container">
            <div className="zibi-catalog-toolbar">
              <div>
                <h2 style={{ fontSize: 'var(--text-2xl)' }}>{t.storefront.catalogTitle}</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {t.storefront.catalogSubtitle}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Select
                  label={t.storefront.currencyLabel}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
                  options={[
                    { value: 'XAF', label: 'XAF (FCFA)' },
                    { value: 'EUR', label: 'EUR (€)' },
                    { value: 'USD', label: 'USD ($)' },
                  ]}
                />
                {currency !== 'XAF' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>
                    {t.common.displayOnlyNote}
                  </span>
                )}
              </div>
            </div>

            {products.length === 0 ? (
              <EmptyState
                title={t.storefront.emptyCatalogTitle}
                subtitle={t.storefront.emptyCatalogSubtitle}
                icon={<Music size={24} />}
              />
            ) : (
              <>
                <div className="zibi-product-grid">
                  {products.map((product) => {
                    const displayPrice = getDisplayPrice(product);
                    const xaf = checkoutAmount(product);
                    const videoPreview = publicMediaUrl(product.videoPreviewUrl);
                    const purchasable = product.checkoutAvailable && xaf !== null && xaf >= 100;
                    return (
                      <Card key={product.productId} interactive className="zibi-product-card">
                        {videoPreview
                          ? <ProductVideo src={videoPreview} label={t.storefront.videoPreview} errorLabel={t.storefront.videoError} />
                          : <MediaContainer alt={product.type.name} aspectRatio="16x9" accentTone="terracotta" monogram={product.type.name} />
                        }

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 'var(--space-2)',
                          }}
                        >
                          <Badge variant="indigo">{t.productTypes[product.type.code]}</Badge>
                        </div>

                        <h3 style={{ fontSize: 'var(--text-lg)' }}>{product.type.name}</h3>
                        {product.description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{product.description}</p>}
                        {product.previewUrl && <audio controls preload="none" src={publicMediaUrl(product.previewUrl)} aria-label={t.storefront.previewAvailable} style={{ width: '100%' }} />}

                        <div className="zibi-product-card__price-row">
                          <div>
                            <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
                              {displayPrice ? formatMoney(displayPrice.amountMinor, displayPrice.currencyCode, locale) : t.storefront.unpriced}
                            </strong>
                            {displayPrice?.currencyCode !== 'XAF' && xaf !== null && (
                              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                {formatMoney(xaf, 'XAF', locale)}
                              </p>
                            )}
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!checkoutProducts[product.productId] && !purchasable}
                            onClick={() => {
                              setCheckoutProducts((current) => current[product.productId] ? current : { ...current, [product.productId]: product });
                              setOpenedProductId(product.productId);
                            }}
                          >
                            {checkoutProducts[product.productId] ? t.checkout.openCheckout : purchasable ? t.common.buyNow : t.storefront.checkoutUnavailable}
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {storefront.nextCursor && (
                  <div style={{ marginTop: 'var(--space-8)', textAlign: 'center' }}>
                    <Button
                      variant="secondary"
                      onClick={handleLoadMoreProducts}
                      isLoading={isLoadingMore}
                    >
                      {t.storefront.loadMoreProducts}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

      </>
    );
  };

  return (
    <>
      {renderCatalog()}
      {Object.values(checkoutProducts).map((product) => (
        <CheckoutModal
          key={product.productId}
          product={product}
          isOpen={openedProductId === product.productId}
          creatorName={storefront?.storefront.displayName}
          onClose={() => setOpenedProductId(null)}
          onPriceChanged={() => refreshCheckoutProduct(product.productId)}
          onRelease={() => setCheckoutProducts((current) => Object.fromEntries(
            Object.entries(current).filter(([id]) => id !== product.productId),
          ))}
        />
      ))}
    </>
  );
}
