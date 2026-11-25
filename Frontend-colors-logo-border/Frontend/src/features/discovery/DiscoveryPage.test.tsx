import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { apiClient } from '@/services/api';
import type { ArtistSummary, DiscoveryArtistsResponse } from '@/types/models';
import { upcomingArtists } from './artists';
import { UpcomingCarousel } from './components/UpcomingCarousel';
import { CuratedArtistPage } from './pages/CuratedArtistPage';
import { DiscoveryPage } from './pages/DiscoveryPage';

const catalog: ArtistSummary[] = Array.from({ length: 6 }, (_, index) => ({
  storefrontId: `test-${index + 1}`,
  handle: `artist-${index + 1}`,
  displayName: `Test Artist ${index + 1}`,
  bio: index === 0 ? 'A short artist biography.' : null,
  storefrontUrl: `https://kamerpay.cm/@artist-${index + 1}`,
}));
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
            <Route path="/artists/:slug" element={<CuratedArtistPage />} />
            <Route path="/:handle" element={<ArtistRoute />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </LanguageProvider>,
  );
}

function renderCarousel(list = upcomingArtists) {
  return render(
    <LanguageProvider>
      <MemoryRouter><UpcomingCarousel artists={list} /></MemoryRouter>
    </LanguageProvider>,
  );
}

describe('Explore editorial sections', () => {
  it('shows only the supplied artists in each section independently of the API', async () => {
    vi.spyOn(apiClient, 'discoverArtists').mockResolvedValue({ items: catalog, nextCursor: null });
    renderDiscovery();

    const upcomingSection = screen.getByRole('region', { name: 'Upcoming Artists' });
    const upcoming = within(upcomingSection);
    expect(upcomingSection.querySelectorAll('.zibi-editorial-slide')).toHaveLength(5);
    expect(upcoming.getByRole('link', { name: 'Read about King Luca' })).toHaveAttribute('href', '/artists/king-luca');
    expect(upcoming.queryByRole('button', { name: 'Show Magasco' })).toBeNull();
    const popular = within(screen.getByRole('region', { name: 'Popular Artists' }));
    expect(popular.getAllByRole('heading', { level: 3 })).toHaveLength(19);
    expect(popular.queryByRole('link', { name: 'Read about King Luca' })).toBeNull();
    const directorySection = screen.getByRole('region', { name: 'Explore All Artists' });
    const directory = within(directorySection);
    expect(new Set(Array.from(directorySection.querySelectorAll('a'), (link) => link.getAttribute('href'))).size).toBe(24);
    expect(directory.getByText('Bikutsi, Makossa & Heritage Fusion', { selector: '.zibi-curated-genre > h3' })).toBeVisible();
    expect(await screen.findByRole('link', { name: /visit test artist 1/i })).toHaveAttribute('href', '/@artist-1');
  });

  it('supports keyboard, touch and slide buttons with a monogram fallback', async () => {
    const user = userEvent.setup();
    const { container } = renderCarousel([{ ...upcomingArtists[0], image: null }, ...upcomingArtists.slice(1)]);
    const viewport = screen.getByRole('group', { name: /use the left and right arrow keys/i });
    expect(container.querySelector('.zibi-media__monogram')).toHaveTextContent('KL');
    viewport.focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Show Eemel' })).toHaveAttribute('aria-current', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Show King Luca' })).toHaveAttribute('aria-current', 'true');
    fireEvent.touchStart(viewport, { touches: [{ clientX: 220, clientY: 80 }] });
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 65, clientY: 91 }] });
    expect(screen.getByRole('button', { name: 'Show Lili Anoma' })).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByRole('button', { name: 'Show Mic Monsta' })).toHaveAttribute('aria-current', 'true');
  });

  it('localizes the editorial sections and slide controls', async () => {
    localStorage.setItem(localeKey, 'fr');
    vi.spyOn(apiClient, 'discoverArtists').mockResolvedValue({ items: [], nextCursor: null });
    renderDiscovery();

    expect(await screen.findByRole('heading', { name: 'Artistes émergents' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Artistes populaires' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Explorer tous les artistes' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Trouver un artiste' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /afficher askia/i }));
    const upcoming = within(screen.getByRole('region', { name: 'Artistes émergents' }));
    expect(upcoming.getByRole('link', { name: 'Découvrir Askia' })).toBeVisible();
  });
});

describe('Explore search and navigation', () => {
  it('finds a curated artist, shows an honest profile and preserves the query on return', async () => {
    vi.spyOn(apiClient, 'discoverArtists').mockResolvedValue({ items: [], nextCursor: null });
    renderDiscovery('/?q=mr+leo');
    const directory = within(screen.getByRole('region', { name: 'Explore All Artists' }));
    expect(directory.getAllByRole('link')).toHaveLength(1);
    await userEvent.click(directory.getByRole('link', { name: 'Read about Mr. Leo' }));
    expect(screen.getByRole('heading', { name: 'Mr. Leo' })).toBeVisible();
    expect(screen.getByText("Je T'aime (ft. Hiro)")).toBeVisible();
    expect(screen.getByText(/yet to confirm a storefront/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: /view storefront/i })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: /back to/i }));
    expect(screen.getByRole('searchbox')).toHaveValue('mr leo');
  });

  it('debounces registered handle search and preserves the query on browser back', async () => {
    const discover = vi.spyOn(apiClient, 'discoverArtists').mockImplementation(async ({ q } = {}) => ({
      items: q ? catalog.filter((artist) => artist.handle === q) : catalog, nextCursor: null,
    }));
    renderDiscovery();
    const user = userEvent.setup();
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole('searchbox'), '@artist-4');
    await waitFor(() => expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'artist-4' })));
    expect(discover).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Upcoming Artists' })).toBeNull();

    const directory = within(screen.getByRole('region', { name: 'Registered storefronts' }));
    await user.click(await directory.findByRole('link', { name: /visit test artist 4/i }));
    expect(await screen.findByText('@artist-4')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(await screen.findByRole('searchbox')).toHaveValue('@artist-4');
  });

  it('paginates registered storefronts without duplicates or curated changes', async () => {
    const discover = vi.spyOn(apiClient, 'discoverArtists')
      .mockResolvedValueOnce({ items: catalog.slice(0, 2), nextCursor: 'cursor-first-page' })
      .mockResolvedValueOnce({ items: catalog.slice(1, 4), nextCursor: null });
    renderDiscovery();
    const directory = within(screen.getByRole('region', { name: 'Registered storefronts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load more artists' }));
    expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-first-page', q: undefined }));
    expect(await directory.findByText('4 artists shown')).toBeVisible();
    expect(directory.getAllByRole('link')).toHaveLength(4);
    expect(within(screen.getByRole('region', { name: 'Explore All Artists' })).getAllByRole('link')).toHaveLength(24);
  });

  it('ignores a late registered storefront page after the query changes', async () => {
    let resolvePage!: (result: DiscoveryArtistsResponse) => void;
    vi.spyOn(apiClient, 'discoverArtists').mockImplementation(async ({ q, cursor } = {}) => {
      if (cursor) return new Promise((resolve) => { resolvePage = resolve; });
      return q ? { items: [catalog[4]], nextCursor: null } : { items: catalog.slice(0, 2), nextCursor: 'old-page' };
    });
    renderDiscovery();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Load more artists' }));
    await user.type(screen.getByRole('searchbox'), 'artist-5');
    const directory = within(screen.getByRole('region', { name: 'Registered storefronts' }));
    expect(await directory.findByRole('link', { name: /visit test artist 5/i })).toBeVisible();
    await act(async () => { resolvePage({ items: [catalog[2]], nextCursor: null }); });
    expect(directory.getAllByRole('link')).toHaveLength(1);
    expect(directory.queryByRole('link', { name: /visit test artist 3/i })).toBeNull();
  });
});
