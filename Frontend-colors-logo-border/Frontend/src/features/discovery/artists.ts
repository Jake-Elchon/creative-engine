import { normalizeHandle } from '@/utils/url';
import { curatedArtists } from './curatedArtists';

export function artistStorefrontPath(handle: string) {
  return `/@${encodeURIComponent(normalizeHandle(handle))}`;
}

export function curatedArtistPath(slug: string) {
  return `/artists/${encodeURIComponent(slug)}`;
}

function normalizeArtistName(value: string) {
  return value.normalize('NFD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function searchCuratedArtists(query: string) {
  const search = normalizeArtistName(query);
  return search ? curatedArtists.filter(({ name }) => normalizeArtistName(name).includes(search)) : curatedArtists;
}

export const upcomingArtists = curatedArtists.filter(({ category }) => category === 'Upcoming');
export const popularArtists = curatedArtists.filter(({ category }) => category === 'Popular');
