import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { MediaContainer } from '@/components/media/MediaContainer';
import type { ArtistSummary } from '@/types/models';
import { normalizeHandle, publicMediaUrl } from '@/utils/url';
import { artistStorefrontPath } from '../artists';
import './ArtistCard.css';

export function ArtistCard({ artist, compact = false }: { artist: ArtistSummary; compact?: boolean }) {
  const { t, formatMessage } = useLanguage();
  const handle = normalizeHandle(artist.handle);

  return (
    <Link
      to={artistStorefrontPath(handle)}
      className={compact ? 'zibi-artist-card zibi-artist-card--compact' : 'zibi-artist-card'}
      aria-label={formatMessage(t.discovery.visitArtist, { name: artist.displayName })}
    >
      <div className="zibi-artist-card__media" aria-hidden="true">
        <MediaContainer
          src={publicMediaUrl(artist.profileImageUrl)}
          alt=""
          aspectRatio={compact ? '1x1' : '4x3'}
          accentTone={compact ? 'forest' : 'gold'}
          monogram={artist.displayName}
        />
      </div>
      <div className="zibi-artist-card__body">
        <div className="zibi-artist-card__identity">
          <h3>{artist.displayName}</h3>
          <span className="zibi-artist-card__handle">@{handle}</span>
        </div>
        {!compact && artist.bio && <p className="zibi-artist-card__bio">{artist.bio}</p>}
        {!compact && <span className="zibi-artist-card__cta">{t.common.viewStorefront}</span>}
      </div>
      <ArrowUpRight className="zibi-artist-card__arrow" size={20} aria-hidden="true" />
    </Link>
  );
}
