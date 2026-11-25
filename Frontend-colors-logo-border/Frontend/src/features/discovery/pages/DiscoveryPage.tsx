import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, ServerCrash, WifiOff, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { ZibiMark } from '@/components/brand/ZibiLogo';
import { Button } from '@/components/ui/Button/Button';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { Input } from '@/components/ui/Input/Input';
import { Skeleton } from '@/components/ui/Skeleton/Skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { ArtistSummary } from '@/types/models';
import { validateSearchQuery } from '@/utils/validation';
import { selectEditorialArtists } from '../artists';
import { ArtistCard } from '../components/ArtistCard';
import { UpcomingCarousel } from '../components/UpcomingCarousel';
import './DiscoveryPage.css';

function searchTerm(value: string) {
  return value.replace(/^@(?=\S)/, '') || undefined;
}

export function DiscoveryPage() {
  const { t, formatMessage } = useLanguage();
  const { homeSeed } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInput = searchParams.get('q') ?? '';
  const debouncedSearch = useDebounce(searchInput, 300);
  const query = validateSearchQuery(searchInput);
  const debouncedQuery = validateSearchQuery(debouncedSearch);

  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [editorialPool, setEditorialPool] = useState<ArtistSummary[]>([]);
  const [editorialDay] = useState(() => Math.floor(Date.now() / 86_400_000));
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState<ApiClientError | null>(null);
  const [paginationError, setPaginationError] = useState(false);
  const [seedUnavailable, setSeedUnavailable] = useState(false);
  const requestSeq = useRef(0);
  const initialRequest = useRef<AbortController | null>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const ignoredSeed = useRef<typeof homeSeed>(null);

  const fetchInitial = useCallback(async (term: string, limit = 20) => {
    initialRequest.current?.abort();
    pageRequest.current?.abort();
    const controller = new AbortController();
    initialRequest.current = controller;
    const requestId = ++requestSeq.current;
    setIsInitialLoading(true);
    setIsLoadingMore(false);
    setInitialError(null);
    setPaginationError(false);
    setSeedUnavailable(false);

    try {
      const result = await apiClient.discoverArtists({ q: searchTerm(term), limit, signal: controller.signal });
      if (controller.signal.aborted || requestId !== requestSeq.current) return;
      setArtists(result.items);
      if (!term) setEditorialPool(result.items);
      setNextCursor(result.nextCursor);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestSeq.current) return;
      setInitialError(error instanceof ApiClientError ? error : new ApiClientError({
        message: '', code: 'UNKNOWN', status: 500, kind: 'SERVER_ERROR', isRetryable: true,
      }));
    } finally {
      if (!controller.signal.aborted && requestId === requestSeq.current) {
        setResolvedQuery(term);
        setIsInitialLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debouncedQuery.isTooLong) return;

    if (debouncedQuery.isEmpty && homeSeed && homeSeed !== ignoredSeed.current) {
      const seedArtists = homeSeed.status === 'ready' ? homeSeed.artists : [];
      setArtists(seedArtists);
      setEditorialPool(seedArtists);
      setNextCursor(homeSeed.status === 'ready' ? homeSeed.nextCursor : null);
      setResolvedQuery('');
      setIsInitialLoading(false);
      setInitialError(null);
      setPaginationError(false);
      setSeedUnavailable(homeSeed.status === 'unavailable');
    } else {
      void fetchInitial(debouncedQuery.trimmed);
    }

    return () => {
      initialRequest.current?.abort();
      pageRequest.current?.abort();
    };
  }, [debouncedQuery.isEmpty, debouncedQuery.isTooLong, debouncedQuery.trimmed, fetchInitial, homeSeed]);

  const directoryLoading = isInitialLoading || resolvedQuery !== query.trimmed;
  const showEditorial = query.isEmpty && (directoryLoading || (!initialError && !seedUnavailable));
  const editorial = selectEditorialArtists(editorialPool, editorialDay);

  function updateSearch(value: string) {
    if (value.trim() !== query.trimmed) pageRequest.current?.abort();
    const params = new URLSearchParams(searchParams);
    if (value) params.set('q', value);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore || directoryLoading || query.isTooLong) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    const requestId = requestSeq.current;
    setIsLoadingMore(true);
    setPaginationError(false);

    try {
      const result = await apiClient.discoverArtists({
        q: searchTerm(query.trimmed), cursor: nextCursor, limit: 20, signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== requestSeq.current) return;
      setArtists((previous) => [...new Map([...previous, ...result.items].map((artist) => [artist.storefrontId, artist])).values()]);
      setNextCursor(result.nextCursor);
    } catch {
      if (!controller.signal.aborted && requestId === requestSeq.current) setPaginationError(true);
    } finally {
      if (pageRequest.current === controller) setIsLoadingMore(false);
    }
  }

  function retrySeed() {
    ignoredSeed.current = homeSeed;
    void fetchInitial('', 6);
  }

  const networkError = initialError?.kind === 'NETWORK_ERROR' || initialError?.kind === 'TIMEOUT_ERROR';

  return (
    <div className="zibi-discovery">
      <section className="zibi-discovery-hero" aria-labelledby="discover-the-sound">
        <div className="zibi-container zibi-discovery-hero__grid">
          <div className="zibi-discovery-hero__copy">
            <h1 id="discover-the-sound">{t.discovery.heroTitle}</h1>
            <p>{t.discovery.heroSubtitle}</p>
            <div className="zibi-discovery-hero__search">
              <Input
                id="zibi-artist-search"
                label={t.discovery.searchLabel}
                type="search"
                value={searchInput}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder={t.discovery.searchPlaceholder}
                leftIcon={<Search size={20} aria-hidden="true" />}
                error={query.isTooLong ? t.discovery.queryTooLong : undefined}
                rightSlot={searchInput && (
                  <button type="button" onClick={() => updateSearch('')} aria-label={t.discovery.clearSearch}>
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              />
            </div>
          </div>
          <div className="zibi-discovery-hero__motif" aria-hidden="true">
            <ZibiMark size={172} decorative />
          </div>
        </div>
      </section>

      {showEditorial && (
        <>
          <section className="zibi-explore-section zibi-explore-section--upcoming" aria-labelledby="upcoming-artists">
            <div className="zibi-container">
              <div className="zibi-explore-heading">
                <h2 id="upcoming-artists">{t.discovery.upcomingTitle}</h2>
                <p>{t.discovery.upcomingSubtitle}</p>
              </div>
              {directoryLoading ? (
                <div className="zibi-explore-feature-loading" role="status">
                  <span className="sr-only">{t.common.loading}</span>
                  <Skeleton height="100%" />
                </div>
              ) : <UpcomingCarousel artists={editorial.upcoming} />}
            </div>
          </section>

          <section className="zibi-explore-section zibi-explore-section--popular" aria-labelledby="popular-artists">
            <div className="zibi-container">
              <div className="zibi-explore-heading">
                <h2 id="popular-artists">{t.discovery.popularTitle}</h2>
                <p>{t.discovery.popularSubtitle}</p>
              </div>
              {directoryLoading ? (
                <div className="zibi-explore-popular-grid" aria-busy="true">
                  <Skeleton height="90px" />
                  <Skeleton height="90px" />
                </div>
              ) : editorial.popular.length ? (
                <div className="zibi-explore-popular-grid">
                  {editorial.popular.map((artist) => <ArtistCard key={artist.storefrontId} artist={artist} compact />)}
                </div>
              ) : <p className="zibi-explore-note">{t.discovery.popularEmpty}</p>}
            </div>
          </section>
        </>
      )}

      <section id="all-artists" className="zibi-explore-section zibi-explore-section--directory" aria-labelledby="directory-heading">
        <div className="zibi-container">
          <div className="zibi-explore-heading zibi-explore-heading--directory">
            <div>
              <h2 id="directory-heading">{t.discovery.sectionTitle}</h2>
              <p>{t.discovery.sectionSubtitle}</p>
            </div>
            {!query.isTooLong && !directoryLoading && !initialError && !seedUnavailable && artists.length > 0 && (
              <span className="zibi-explore-count">{formatMessage(t.discovery.resultsCount, { count: artists.length })}</span>
            )}
          </div>
          {query.isTooLong ? (
            <EmptyState title={t.discovery.queryTooLong} />
          ) : directoryLoading ? (
            <div className="zibi-artist-grid" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="zibi-explore-directory-loading">
                  <Skeleton height="180px" />
                  <Skeleton height="26px" width="60%" />
                  <Skeleton height="16px" width="40%" />
                </div>
              ))}
            </div>
          ) : seedUnavailable ? (
            <ErrorState title={t.discovery.seedUnavailableTitle} subtitle={t.discovery.seedUnavailableSubtitle} onRetry={retrySeed} />
          ) : initialError ? (
            <ErrorState
              title={networkError ? t.discovery.initialErrorNetwork : t.discovery.initialErrorServer}
              icon={networkError ? <WifiOff size={24} /> : <ServerCrash size={24} />}
              onRetry={initialError.isRetryable ? () => void fetchInitial(query.trimmed) : undefined}
            />
          ) : artists.length === 0 ? (
            <EmptyState
              title={query.isEmpty ? t.discovery.directoryEmpty : t.discovery.emptyTitle}
              subtitle={query.isEmpty ? undefined : t.discovery.emptySubtitle}
              action={query.isEmpty ? undefined : <Button variant="secondary" onClick={() => updateSearch('')}>{t.discovery.clearSearch}</Button>}
            />
          ) : (
            <>
              <div className="zibi-artist-grid">
                {artists.map((artist) => <ArtistCard key={artist.storefrontId} artist={artist} />)}
              </div>
              {(nextCursor || paginationError) && (
                <div className="zibi-explore-pagination">
                  {paginationError && <p role="alert">{t.discovery.paginationError}</p>}
                  {nextCursor && (
                    <Button variant="secondary" onClick={() => void handleLoadMore()} isLoading={isLoadingMore}>
                      {isLoadingMore ? t.common.loadingMore : t.common.loadMore}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
