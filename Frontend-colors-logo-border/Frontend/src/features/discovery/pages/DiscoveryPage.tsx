import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Sparkles, WifiOff, ServerCrash, X, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { MediaContainer } from '@/components/media/MediaContainer';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { Input } from '@/components/ui/Input/Input';
import { Skeleton } from '@/components/ui/Skeleton/Skeleton';
import { ArtistCard } from '@/features/discovery/components/ArtistCard';
import { useDebounce } from '@/hooks/useDebounce';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { ArtistSummary } from '@/types/models';
import { MAX_SEARCH_QUERY_LENGTH, validateSearchQuery } from '@/utils/validation';
import './DiscoveryPage.css';

function mergeUniqueArtists(
  existing: ArtistSummary[],
  incoming: ArtistSummary[],
): ArtistSummary[] {
  const seen = new Set(existing.map((a) => a.storefrontId));
  const next = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.storefrontId)) {
      seen.add(item.storefrontId);
      next.push(item);
    }
  }
  return next;
}

export function DiscoveryPage() {
  const { t, formatMessage } = useLanguage();
  const { homeSeed, clearHomeSeed } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [initialError, setInitialError] = useState<ApiClientError | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [seedUnavailable, setSeedUnavailable] = useState(false);

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  const queryValidation = validateSearchQuery(searchInput);
  const debouncedValidation = validateSearchQuery(debouncedSearch);

  const fetchInitial = useCallback(
    async (queryText: string, limitOverride?: number) => {
      const validation = validateSearchQuery(queryText);
      if (validation.isTooLong) {
        return;
      }

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const reqId = ++requestSeqRef.current;

      setIsInitialLoading(true);
      setInitialError(null);
      setPaginationError(null);
      setSeedUnavailable(false);

      try {
        const res = await apiClient.discoverArtists({
          q: validation.isEmpty ? undefined : validation.trimmed,
          limit: limitOverride ?? 20,
          signal: controller.signal,
        });

        if (reqId !== requestSeqRef.current) return;

        setArtists(res.items);
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (reqId !== requestSeqRef.current) return;

        if (err instanceof ApiClientError) {
          setInitialError(err);
        } else {
          setInitialError(
            new ApiClientError({
              message: t.discovery.initialErrorServer,
              code: 'UNKNOWN',
              status: 500,
              kind: 'SERVER_ERROR',
              isRetryable: true,
            }),
          );
        }
      } finally {
        if (reqId === requestSeqRef.current) {
          setIsInitialLoading(false);
        }
      }
    },
    [t.discovery.initialErrorServer],
  );

  // Initial load & search changes, respecting OTP home seed when no search query is active
  useEffect(() => {
    if (debouncedValidation.isTooLong) {
      return;
    }

    if (debouncedValidation.isEmpty && homeSeed) {
      if (homeSeed.status === 'ready') {
        setArtists(homeSeed.artists);
        setNextCursor(homeSeed.nextCursor);
        setIsInitialLoading(false);
        setInitialError(null);
        setSeedUnavailable(false);
        return;
      }

      if (homeSeed.status === 'unavailable') {
        setArtists([]);
        setNextCursor(null);
        setIsInitialLoading(false);
        setSeedUnavailable(true);
        return;
      }
    }

    void fetchInitial(debouncedValidation.trimmed);

    return () => {
      activeAbortRef.current?.abort();
    };
  }, [
    debouncedValidation.isEmpty,
    debouncedValidation.isTooLong,
    debouncedValidation.trimmed,
    fetchInitial,
    homeSeed,
  ]);

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore || isInitialLoading) return;

    setIsLoadingMore(true);
    setPaginationError(null);

    try {
      const res = await apiClient.discoverArtists({
        q: debouncedValidation.isEmpty ? undefined : debouncedValidation.trimmed,
        cursor: nextCursor,
        limit: 20,
      });

      setArtists((prev) => mergeUniqueArtists(prev, res.items));
      setNextCursor(res.nextCursor);
    } catch {
      setPaginationError(t.discovery.paginationError);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSeedRetry = () => {
    clearHomeSeed();
    void fetchInitial('', 6);
  };

  const spotlightArtist = artists[0];

  return (
    <>
      <section className="zibi-hero">
        <div className="zibi-hero__glow" aria-hidden="true" />
        <div className="zibi-container zibi-hero__grid">
          <div className="zibi-hero__content">
            <Badge variant="gold" className="zibi-hero__eyebrow">
              <Sparkles size={12} />
              {t.discovery.eyebrow}
            </Badge>

            <h1 className="zibi-hero__title">
              {t.discovery.heroTitle}
            </h1>
            <p className="zibi-hero__subtitle">{t.discovery.heroSubtitle}</p>

            <div className="zibi-hero__search-wrap">
              <label className="zibi-hero__search-label" htmlFor="zibi-artist-search">
                {t.discovery.searchLabel}
              </label>
              <div className="zibi-hero__search">
                <Input
                  id="zibi-artist-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchInput(val);
                    if (val.trim().length > 0 && homeSeed) {
                      // User actively searched; reset cursor before debounced fetch
                      setNextCursor(null);
                    }
                  }}
                  placeholder={t.discovery.searchPlaceholder}
                  aria-label={t.discovery.searchAriaLabel}
                  leftIcon={<Search size={18} />}
                  error={queryValidation.isTooLong ? t.discovery.queryTooLong : undefined}
                  hint={
                    searchInput.length > 0
                      ? formatMessage(t.discovery.charLimitHint, {
                          count: searchInput.length,
                        })
                      : undefined
                  }
                  rightSlot={
                    searchInput.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSearchInput('')}
                        aria-label={t.discovery.clearSearch}
                        className="zibi-hero__search-clear"
                      >
                        <X size={16} />
                      </button>
                    ) : null
                  }
                />
              </div>
              {searchInput.length > MAX_SEARCH_QUERY_LENGTH && (
                <span className="sr-only">{t.discovery.queryTooLong}</span>
              )}
            </div>
          </div>

          <div className="zibi-hero__spotlight">
            {spotlightArtist ? (
              <Link
                to={`/@${spotlightArtist.handle}`}
                className="zibi-hero__spotlight-link"
                aria-label={`${t.common.viewStorefront}: ${spotlightArtist.displayName}`}
              >
                <div className="zibi-hero__spotlight-media">
                  <MediaContainer
                    src={spotlightArtist.coverUrl || spotlightArtist.avatarUrl}
                    alt={`${spotlightArtist.displayName} creator portrait or cover`}
                    aspectRatio="16x9"
                    accentTone={spotlightArtist.accentTone || 'terracotta'}
                    monogram={spotlightArtist.displayName}
                    priority
                  />
                  <span className="zibi-hero__spotlight-index">01</span>
                </div>

                <div className="zibi-hero__spotlight-label">
                  <span>{t.discovery.featuredLabel}</span>
                  {spotlightArtist.city && (
                    <span className="zibi-hero__spotlight-location">
                      {spotlightArtist.city}
                    </span>
                  )}
                </div>

                <div className="zibi-hero__spotlight-identity">
                  <div>
                    <strong>{spotlightArtist.displayName}</strong>
                    <span>@{spotlightArtist.handle}</span>
                  </div>
                  <span className="zibi-hero__spotlight-arrow" aria-hidden="true">
                    <ArrowUpRight size={19} />
                  </span>
                </div>

                {spotlightArtist.genre && (
                  <span className="zibi-hero__spotlight-genre">
                    {spotlightArtist.genre}
                  </span>
                )}
              </Link>
            ) : (
              <div className="zibi-hero__spotlight-fallback">
                <div className="zibi-hero__spotlight-label">
                  <span>{t.discovery.featuredLabel}</span>
                </div>
                <MediaContainer
                  alt="Zibi Featured Cameroonian Artistry"
                  aspectRatio="16x9"
                  accentTone="gold"
                  monogram="ZB"
                  priority
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <hr className="cultural-divider" />

      <section className="zibi-discovery-section">
        <div className="zibi-container">
          <div className="zibi-discovery-header">
            <div>
              <h2>{t.discovery.sectionTitle}</h2>
              <p>{t.discovery.sectionSubtitle}</p>
            </div>
            {!isInitialLoading && !initialError && !seedUnavailable && artists.length > 0 && (
              <span className="zibi-discovery-results">
                {formatMessage(t.discovery.resultsCount, { count: artists.length })}
              </span>
            )}
          </div>

          {seedUnavailable ? (
            <ErrorState
              title={t.discovery.seedUnavailableTitle}
              subtitle={t.discovery.seedUnavailableSubtitle}
              onRetry={handleSeedRetry}
            />
          ) : isInitialLoading ? (
            <div className="zibi-artist-grid" aria-busy="true">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="zibi-discovery-loading-card"
                >
                  <Skeleton height="360px" />
                  <Skeleton width="65%" height="24px" />
                  <Skeleton width="40%" height="14px" />
                  <Skeleton width="100%" height="36px" />
                </div>
              ))}
            </div>
          ) : initialError ? (
            <ErrorState
              title={
                initialError.kind === 'NETWORK_ERROR' || initialError.kind === 'TIMEOUT_ERROR'
                  ? t.discovery.initialErrorNetwork
                  : t.discovery.initialErrorServer
              }
              subtitle={initialError.message}
              icon={
                initialError.kind === 'NETWORK_ERROR' || initialError.kind === 'TIMEOUT_ERROR' ? (
                  <WifiOff size={24} />
                ) : (
                  <ServerCrash size={24} />
                )
              }
              onRetry={
                initialError.isRetryable
                  ? () => void fetchInitial(debouncedValidation.trimmed)
                  : undefined
              }
            />
          ) : artists.length === 0 ? (
            <EmptyState
              title={t.discovery.emptyTitle}
              subtitle={t.discovery.emptySubtitle}
              action={
                searchInput.length > 0 ? (
                  <Button variant="secondary" onClick={() => setSearchInput('')}>
                    {t.discovery.clearSearch}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="zibi-artist-grid">
                {artists.map((artist, index) => (
                  <ArtistCard
                    key={artist.storefrontId}
                    artist={artist}
                    index={index}
                  />
                ))}
              </div>

              {(nextCursor || paginationError) && (
                <div className="zibi-pagination-area">
                  {paginationError && (
                    <p style={{ color: 'var(--state-error)', fontSize: 'var(--text-sm)' }}>
                      {paginationError}
                    </p>
                  )}
                  {nextCursor && (
                    <Button
                      variant="secondary"
                      onClick={handleLoadMore}
                      isLoading={isLoadingMore}
                    >
                      {isLoadingMore ? t.common.loadingMore : t.common.loadMore}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
