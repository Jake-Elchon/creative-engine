import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { MediaContainer } from '@/components/media/MediaContainer';
import type { ArtistSummary } from '@/types/models';
import { normalizeHandle } from '@/utils/url';
import { artistStorefrontPath, curatedArtistPath } from '../artists';
import type { CuratedArtist } from '../curatedArtists';
import { ArtistArtwork } from './ArtistArtwork';
import './ArtistCard.css';

export function ArtistCard({ artist, compact = false }: {
  artist: Pick<ArtistSummary, 'displayName' | 'handle' | 'bio'> | CuratedArtist;
  compact?: boolean;
}) {
  const { t, formatMessage } = useLanguage();
  const { search } = useLocation();
  const editorial = 'slug' in artist;
  const name = editorial ? artist.name : artist.displayName;
  const handle = editorial ? '' : normalizeHandle(artist.handle);
  const aspectRatio = compact ? '1x1' : '4x3';

  return (
    <Link
      to={editorial ? curatedArtistPath(artist.slug) : artistStorefrontPath(handle)}
      state={{ exploreSearch: search }}
      className={compact ? 'zibi-artist-card zibi-artist-card--compact' : 'zibi-artist-card'}
      aria-label={formatMessage(editorial ? t.discovery.readArtist : t.discovery.visitArtist, { name })}
    >
      <div className="zibi-artist-card__media" aria-hidden="true">
        {editorial
          ? <ArtistArtwork artist={artist} aspectRatio={aspectRatio} decorative />
          : <MediaContainer alt="" aspectRatio={aspectRatio} monogram={name} />}
      </div>
      <div className="zibi-artist-card__body">
        <div className="zibi-artist-card__identity">
          <h3>{name}</h3>
          <span className="zibi-artist-card__handle">
            {editorial ? t.discovery.genres[artist.genreCategory] : `@${handle}`}
          </span>
        </div>
        {!compact && artist.bio && <p className="zibi-artist-card__bio" lang={editorial ? "en" : undefined}>{artist.bio}</p>}
        {!compact && <span className="zibi-artist-card__cta">
          {editorial ? t.discovery.discoverArtist : t.common.viewStorefront}
        </span>}
      </div>
      <ArrowUpRight className="zibi-artist-card__arrow" size={20} aria-hidden="true" />
    </Link>
  );
}
