import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { MediaContainer } from '@/components/media/MediaContainer';
import type { ArtistSummary } from '@/types/models';
import { normalizeHandle } from '@/utils/url';
import './ArtistCard.css';

export interface ArtistCardProps {
  artist: ArtistSummary;
  index?: number;
}

export function ArtistCard({ artist, index = 0 }: ArtistCardProps) {
  const { t } = useLanguage();
  const cleanHandle = normalizeHandle(artist.handle);
  const destination = `/@${cleanHandle}`;

  return (
    <Link to={destination} className="zibi-artist-card">
      <div className="zibi-artist-card__media">
        {artist.genre && (
          <div className="zibi-artist-card__genre">
            <span>{artist.genre}</span>
          </div>
        )}
        <span className="zibi-artist-card__index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <MediaContainer
          src={artist.avatarUrl}
          alt={`${artist.displayName}, ${artist.genre || 'Zibi creator'} from ${artist.city || 'Cameroon'}`}
          aspectRatio="3x4"
          accentTone={artist.accentTone || 'gold'}
          monogram={artist.displayName}
        />
      </div>

      <div className="zibi-artist-card__body">
        <div className="zibi-artist-card__header">
          <div>
            <h3 className="zibi-artist-card__name">{artist.displayName}</h3>
            <span className="zibi-artist-card__handle">@{cleanHandle}</span>
          </div>
          <span className="zibi-artist-card__arrow" aria-hidden="true">
            <ArrowUpRight size={17} />
          </span>
        </div>

        <p className="zibi-artist-card__bio">{artist.bio}</p>

        <div className="zibi-artist-card__footer">
          <span className="zibi-artist-card__city">
            {artist.city && (
              <>
                <MapPin size={12} />
                {artist.city}
              </>
            )}
          </span>
          <span className="zibi-artist-card__cta">
            {t.common.viewStorefront}
          </span>
        </div>
      </div>
    </Link>
  );
}
