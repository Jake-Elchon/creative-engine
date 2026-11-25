import { MediaContainer, type AspectRatio } from '@/components/media/MediaContainer';
import type { CuratedArtist } from '../curatedArtists';
import './ArtistArtwork.css';

export function ArtistArtwork({ artist, aspectRatio = '4x3', priority = false, decorative = false }: {
  artist: Pick<CuratedArtist, 'name' | 'image'>;
  aspectRatio?: AspectRatio;
  priority?: boolean;
  decorative?: boolean;
}) {
  return <MediaContainer src={artist.image?.src} alt={decorative ? '' : artist.name}
    monogram={artist.name} aspectRatio={aspectRatio} accentTone="terracotta" priority={priority}
    className={`zibi-artist-artwork zibi-artist-artwork--${artist.image?.framing ?? 'center'}`} />;
}
