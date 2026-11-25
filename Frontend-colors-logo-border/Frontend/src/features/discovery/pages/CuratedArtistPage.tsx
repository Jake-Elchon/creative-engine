import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { NotFoundPage } from '@/layouts/NotFoundPage';
import { ArtistArtwork } from '../components/ArtistArtwork';
import { curatedArtists } from '../curatedArtists';
import './CuratedArtistPage.css';

export function CuratedArtistPage() {
  const { slug } = useParams();
  const { state } = useLocation();
  const { t } = useLanguage();
  const artist = curatedArtists.find((entry) => entry.slug === slug);
  if (!artist) return <NotFoundPage />;

  const backToExplore = { pathname: '/', search: typeof state?.exploreSearch === 'string' ? state.exploreSearch : '' };
  return (
    <section className="zibi-curated-profile">
      <div className="zibi-container">
        <Link className="zibi-curated-profile__back" to={backToExplore}>
          <ArrowLeft size={18} aria-hidden="true" /> {t.common.backToDiscovery}
        </Link>
        <div className="zibi-curated-profile__hero">
          <ArtistArtwork artist={artist} aspectRatio="1x1" priority />
          <div className="zibi-curated-profile__identity">
            <p>{t.discovery.genres[artist.genreCategory]} · {artist.category === 'Upcoming' ? t.discovery.upcomingTitle : t.discovery.popularTitle}</p>
            <h1>{artist.name}</h1>
            <p lang="en">{artist.bio}</p>
            <p className="zibi-curated-profile__status">{t.discovery.unverifiedStorefront}</p>
          </div>
        </div>

        <section className="zibi-curated-profile__songs" aria-labelledby="curated-songs">
          <h2 id="curated-songs">{t.discovery.selectedSongs}</h2>
          <ul>{artist.songs.map((song) => <li key={song}>{song}</li>)}</ul>
          {artist.songNote && <p lang="en">{artist.songNote}</p>}
        </section>
      </div>
    </section>
  );
}
