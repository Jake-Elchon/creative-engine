import type { ArtistSummary } from '@/types/models';
import { normalizeHandle } from '@/utils/url';

export function artistStorefrontPath(handle: string) {
  return `/@${encodeURIComponent(normalizeHandle(handle))}`;
}

export function selectEditorialArtists(artists: ArtistSummary[], day: number) {
  const unique = [...new Map(artists.map((artist) => [artist.storefrontId, artist])).values()];
  const start = unique.length ? day % unique.length : 0;
  const rotated = [...unique.slice(start), ...unique.slice(0, start)];
  const upcomingCount = Math.min(4, Math.ceil(rotated.length / 2));

  return {
    upcoming: rotated.slice(0, upcomingCount),
    popular: rotated.slice(upcomingCount, upcomingCount + 4),
  };
}
