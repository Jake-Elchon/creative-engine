import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { apiClient } from '@/services/api';
import type { ArtistSummary, DiscoveryArtistsResponse } from '@/types/models';
import { selectEditorialArtists } from './artists';
import { UpcomingCarousel } from './components/UpcomingCarousel';
import { DiscoveryPage } from './pages/DiscoveryPage';

function artists(count: number): ArtistSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    storefrontId: `test-${index + 1}`,
    handle: `artist-${index + 1}`,
    displayName: `Test Artist ${index + 1}`,
    bio: index === 0 ? 'A short artist biography.' : null,
    storefrontUrl: `https://kamerpay.cm/@artist-${index + 1}`,
  }));
}

const catalog = artists(6);
const localeKey = 'zibi.locale';

afterEach(() => {
  localStorage.removeItem(localeKey);
  vi.restoreAllMocks();
});

function ArtistRoute() {
  const { handle } = useParams();
  const navigate = useNavigate();
  return <><p>{handle}</p><button type="button" onClick={() => navigate(-1)}>Browser back</button></>;
}

function renderDiscovery(entry = '/') {
  return render(
    <LanguageProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/" element={<DiscoveryPage />} />
            <Route path="/:handle" element={<ArtistRoute />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </LanguageProvider>,
  );
}

function renderCarousel(count: number) {
  render(
    <LanguageProvider>
      <MemoryRouter><UpcomingCarousel artists={artists(count)} /></MemoryRouter>
    </LanguageProvider>,
  );
}

describe('Explore editorial sections', () => {
  it.each([0, 1, 2, 6])('keeps the promotional slide usable with %s artists', async (count) => {
    renderCarousel(count);
    const user = userEvent.setup();
    if (count === 0) {
      expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull();
    } else {
      const slides = screen.getByRole('group', { name: /use the left and right arrow keys/i });
      expect(within(slides).getByRole('link', { name: /visit test artist 1/i })).toHaveAttribute('href', '/@artist-1');
      expect(screen.getByRole('button', { name: 'Previous slide' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Next slide' }));
      expect(screen.getByRole('button', { name: 'Previous slide' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: /show your talent deserves more/i }));
      expect(screen.getByRole('button', { name: 'Next slide' })).toBeDisabled();
    }
    expect(screen.getByRole('link', { name: 'Discover ZIBI' })).toHaveAttribute('href', '#all-artists');
  });

  it('supports arrow keys, Home, End and horizontal touch gestures', async () => {
    renderCarousel(2);
    const user = userEvent.setup();
    const viewport = screen.getByRole('group', { name: /use the left and right arrow keys/i });
    viewport.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Show Test Artist 2' })).toHaveAttribute('aria-current', 'true');
    await user.keyboard('{End}{Home}');
    expect(screen.getByRole('button', { name: 'Show Test Artist 1' })).toHaveAttribute('aria-current', 'true');
    fireEvent.touchStart(viewport, { touches: [{ clientX: 220, clientY: 80 }] });
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 150, clientY: 220 }] });
    expect(screen.getByRole('button', { name: 'Show Test Artist 1' })).toHaveAttribute('aria-current', 'true');
    fireEvent.touchStart(viewport, { touches: [{ clientX: 220, clientY: 80 }] });
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 65, clientY: 91 }] });
    expect(screen.getByRole('button', { name: 'Show Test Artist 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('deduplicates the two editorial collections and rotates actual artists', () => {
    const first = selectEditorialArtists([...catalog, catalog[0]], 0);
    const next = selectEditorialArtists(catalog, 1);
    const featured = [...first.upcoming, ...first.popular].map((artist) => artist.storefrontId);
    expect(featured).toHaveLength(6);
    expect(new Set(featured).size).toBe(6);
    expect(first.upcoming[0]).toBe(catalog[0]);
    expect(next.upcoming[0]).toBe(catalog[1]);
  });

  it('localizes the editorial headings, search, promotion and controls', async () => {
    localStorage.setItem(localeKey, 'fr');
    vi.spyOn(apiClient, 'discoverArtists').mockResolvedValue({ items: catalog, nextCursor: null });
    renderDiscovery();

    expect(await screen.findByRole('heading', { name: 'Artistes émergents' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Artistes populaires' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Explorer tous les artistes' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Trouver un artiste' })).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: /afficher votre talent/i }));
    expect(screen.getByRole('link', { name: 'Découvrir ZIBI' })).toBeVisible();
  });
});

describe('Explore directory', () => {
  it('debounces handle search, uses an internal artist URL and restores the query when going back', async () => {
    const discover = vi.spyOn(apiClient, 'discoverArtists').mockImplementation(async ({ q } = {}) => ({
      items: q ? catalog.filter((artist) => artist.handle === q) : catalog, nextCursor: null,
    }));
    renderDiscovery();
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox', { name: 'Find an artist' });
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(1));
    await user.type(search, '@artist-4');
    await waitFor(() => expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'artist-4' })));
    expect(discover).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Upcoming Artists' })).toBeNull();

    const directory = screen.getByRole('region', { name: 'Explore All Artists' });
    await user.click(await within(directory).findByRole('link', { name: /visit test artist 4/i }));
    expect(await screen.findByText('@artist-4')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(await screen.findByRole('searchbox')).toHaveValue('@artist-4');
    expect(await within(screen.getByRole('region', { name: 'Explore All Artists' })).findByRole('link', { name: /visit test artist 4/i })).toBeVisible();
  });

  it('loads more with the current cursor and appends unique artists to the directory only', async () => {
    const discover = vi.spyOn(apiClient, 'discoverArtists')
      .mockResolvedValueOnce({ items: catalog.slice(0, 2), nextCursor: 'cursor-first-page' })
      .mockResolvedValueOnce({ items: catalog.slice(1, 4), nextCursor: null });
    renderDiscovery();
    const user = userEvent.setup();
    const directory = screen.getByRole('region', { name: 'Explore All Artists' });

    await user.click(await screen.findByRole('button', { name: 'Load more artists' }));
    expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-first-page', q: undefined }));
    expect(await within(directory).findByText('4 artists shown')).toBeVisible();
    expect(within(directory).getAllByRole('link')).toHaveLength(4);
    expect(within(screen.getByRole('region', { name: 'Popular Artists' })).getAllByRole('link')).toHaveLength(1);
  });

  it('ignores a late page if the search changes', async () => {
    let resolvePage!: (result: DiscoveryArtistsResponse) => void;
    vi.spyOn(apiClient, 'discoverArtists').mockImplementation(async ({ q, cursor } = {}) => {
      if (cursor) return new Promise((resolve) => { resolvePage = resolve; });
      return q ? { items: [catalog[4]], nextCursor: null } : { items: catalog.slice(0, 2), nextCursor: 'old-page' };
    });
    renderDiscovery();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Load more artists' }));
    await user.type(screen.getByRole('searchbox'), 'artist-5');
    const directory = screen.getByRole('region', { name: 'Explore All Artists' });
    expect(await within(directory).findByRole('link', { name: /visit test artist 5/i })).toBeVisible();

    await act(async () => { resolvePage({ items: [catalog[2]], nextCursor: null }); });
    expect(within(directory).getAllByRole('link')).toHaveLength(1);
    expect(within(directory).queryByRole('link', { name: /visit test artist 3/i })).toBeNull();
  });
});
