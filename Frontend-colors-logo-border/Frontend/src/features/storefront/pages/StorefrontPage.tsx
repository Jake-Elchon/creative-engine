import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Music,
  Play,
  Share2,
  Sparkles,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { useToast } from '@/app/providers/ToastProvider';
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
import { buildStorefrontPublicUrl, normalizeHandle } from '@/utils/url';
import './StorefrontPage.css';

export function StorefrontPage() {
  const { handle: rawHandle } = useParams<{ handle: string }>();
  const cleanHandle = normalizeHandle(rawHandle);
  const { locale, t, formatMessage } = useLanguage();
  const { pushToast } = useToast();

  const [storefront, setStorefront] = useState<StorefrontDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);

  const [currency, setCurrency] = useState<SupportedCurrency>('XAF');
  const [copied, setCopied] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);

  const loadStorefront = useCallback(
    async (signal?: AbortSignal) => {
      if (!cleanHandle) return;
      setIsLoading(true);
      setError(null);

      try {
        const data = await apiClient.getPublicStorefront({
          handle: cleanHandle,
          limit: 12,
          signal,
        });
        setStorefront(data);
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
        setIsLoading(false);
      }
    },
    [cleanHandle, t.storefront.loadErrorSubtitle],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStorefront(controller.signal);
    return () => controller.abort();
  }, [loadStorefront]);

  const handleCopyUrl = async () => {
    const urlToCopy =
      storefront?.artist.storefrontUrl || buildStorefrontPublicUrl(cleanHandle);
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
      storefront.artist.storefrontUrl || buildStorefrontPublicUrl(cleanHandle);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${storefront.artist.displayName} — Zibi`,
          text: storefront.artist.bio,
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
    if (!storefront?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const more = await apiClient.getPublicStorefront({
        handle: cleanHandle,
        cursor: storefront.nextCursor,
        limit: 12,
      });
      setStorefront((prev) =>
        prev
          ? {
              ...prev,
              products: [...prev.products, ...more.products],
              nextCursor: more.nextCursor,
            }
          : more,
      );
    } catch {
      pushToast(t.storefront.loadErrorSubtitle, 'error');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const getProductDisplayPrice = (product: StorefrontProduct): string => {
    if (currency === 'XAF') {
      return formatMoney(product.xafPrice, 'XAF', locale);
    }
    const found = product.displayPrices?.find((p) => p.currency === currency);
    if (found) {
      return formatMoney(found.amount, currency, locale);
    }
    return formatMoney(product.xafPrice, 'XAF', locale);
  };

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
              : error.message
          }
          onRetry={error.isRetryable ? () => void loadStorefront() : undefined}
        />
        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
          <Link to="/">
            <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}>
              {t.common.backToDiscovery}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!storefront) return null;

  const { artist, products } = storefront;
  const publicUrl = artist.storefrontUrl || buildStorefrontPublicUrl(artist.handle);

  return (
    <>
      <section className="zibi-storefront-header pattern-bamileke">
        <div className="zibi-storefront-header__glow" aria-hidden="true" />
        <div className="zibi-container">
          <div style={{ marginBottom: 'var(--space-5)', position: 'relative', zIndex: 1 }}>
            <Link to="/">
              <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={14} />}>
                {t.common.backToDiscovery}
              </Button>
            </Link>
          </div>

          <div className="zibi-storefront-banner">
            <MediaContainer
              src={artist.avatarUrl}
              alt={artist.displayName}
              aspectRatio="1x1"
              accentTone={artist.accentTone || 'gold'}
              monogram={artist.displayName}
              priority
            />

            <div className="zibi-storefront-meta">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <Badge variant="gold">
                  <Sparkles size={12} />
                  {t.storefront.verifiedCreator}
                </Badge>
                {artist.genre && <Badge variant="terracotta">{artist.genre}</Badge>}
                {artist.city && <Badge variant="neutral">{artist.city}</Badge>}
              </div>

              <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, var(--text-4xl))' }}>
                {artist.displayName}
              </h1>

              <p style={{ color: 'var(--color-gold)', fontWeight: 'var(--font-semibold)' }}>
                @{normalizeHandle(artist.handle)}
              </p>

              <p
                style={{
                  color: 'var(--text-secondary)',
                  maxWidth: '62ch',
                  lineHeight: 'var(--leading-relaxed)',
                }}
              >
                {artist.bio}
              </p>

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
                {products.map((product) => (
                  <Card key={product.productId} interactive className="zibi-product-card">
                    <MediaContainer
                      src={product.coverUrl}
                      alt={product.title}
                      aspectRatio="16x9"
                      accentTone={artist.accentTone || 'terracotta'}
                      monogram={product.title}
                    />

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <Badge variant="indigo">{product.type}</Badge>
                      {product.previewAvailable && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-gold)',
                          }}
                        >
                          <Play size={12} />
                          {t.storefront.previewAvailable}
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: 'var(--text-lg)' }}>{product.title}</h3>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      {product.description}
                    </p>

                    <div className="zibi-product-card__price-row">
                      <div>
                        <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
                          {getProductDisplayPrice(product)}
                        </strong>
                        {currency !== 'XAF' && (
                          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            {formatMoney(product.xafPrice, 'XAF', locale)}
                          </p>
                        )}
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setSelectedProduct(product)}
                      >
                        {t.common.buyNow}
                      </Button>
                    </div>
                  </Card>
                ))}
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

      <CheckoutModal
        product={selectedProduct}
        creatorName={artist.displayName}
        onClose={() => setSelectedProduct(null)}
        onPriceChanged={() => void loadStorefront()}
      />
    </>
  );
}
