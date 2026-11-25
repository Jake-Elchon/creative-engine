import { useId, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { curatedArtistPath } from '../artists';
import type { CuratedArtist } from '../curatedArtists';
import { ArtistArtwork } from './ArtistArtwork';

export function UpcomingCarousel({ artists }: { artists: readonly CuratedArtist[] }) {
  const { t, formatMessage } = useLanguage();
  const labels = t.discovery.carousel;
  const { search } = useLocation();
  const trackId = useId();
  const [index, setIndex] = useState(0);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastSwipe = useRef(-Infinity);
  const lastIndex = Math.max(0, artists.length - 1);
  const current = Math.min(index, lastIndex);
  const slideNames = artists.map((artist) => artist.name);

  function move(offset: number) {
    setIndex((previous) => Math.max(0, Math.min(Math.min(previous, lastIndex) + offset, lastIndex)));
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (lastIndex === 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') setIndex(0);
    else if (event.key === 'End') setIndex(lastIndex);
    else move(event.key === 'ArrowLeft' ? -1 : 1);
    if (event.target !== event.currentTarget) event.currentTarget.focus();
  }

  function startTouch(event: TouchEvent<HTMLDivElement>) {
    const point = event.touches[0];
    touchOrigin.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
  }

  function finishTouch(event: TouchEvent<HTMLDivElement>) {
    const start = touchOrigin.current;
    const point = event.changedTouches[0];
    touchOrigin.current = null;
    if (!start || !point || lastIndex === 0) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) {
      lastSwipe.current = performance.now();
      move(dx < 0 ? 1 : -1);
    }
  }

  function slideLabel(index: number) {
    return formatMessage(labels.position, {
      name: slideNames[index], index: index + 1, total: slideNames.length,
    });
  }

  if (!artists.length) return null;

  return (
    <div className="zibi-editorial-slider" role="group" aria-label={labels.label} aria-roledescription={labels.carousel}>
      <div
        className="zibi-editorial-slider__viewport"
        role={lastIndex ? 'group' : undefined}
        tabIndex={lastIndex ? 0 : undefined}
        aria-label={lastIndex ? labels.keyboard : undefined}
        onKeyDown={handleKeys}
        onTouchStart={startTouch}
        onTouchEnd={finishTouch}
        onTouchCancel={() => { touchOrigin.current = null; }}
        onClickCapture={(event) => {
          if (event.detail > 0 && performance.now() - lastSwipe.current < 350) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div id={trackId} className="zibi-editorial-slider__track" style={{ transform: `translateX(-${current * 100}%)` }}>
          {artists.map((artist, slide) => (
              <article
                className="zibi-editorial-slide"
                key={artist.slug}
                aria-roledescription={labels.slide}
                aria-label={slideLabel(slide)}
                aria-hidden={slide !== current ? true : undefined}
                inert={slide !== current}
              >
                <div className="zibi-editorial-slide__art" aria-hidden="true">
                  <ArtistArtwork artist={artist} decorative />
                </div>
                <div className="zibi-editorial-slide__copy">
                  <p className="zibi-editorial-slide__handle">{t.discovery.genres[artist.genreCategory]}</p>
                  <h3>{artist.name}</h3>
                  {artist.bio && <p className="zibi-editorial-slide__bio" lang="en">{artist.bio}</p>}
                  <Link
                    className="zibi-editorial-slide__link"
                    to={curatedArtistPath(artist.slug)}
                    state={{ exploreSearch: search }}
                    aria-label={formatMessage(t.discovery.readArtist, { name: artist.name })}
                  >
                    {t.discovery.discoverArtist}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </article>
          ))}
        </div>
      </div>

      {lastIndex > 0 && (
        <div className="zibi-editorial-slider__controls" role="group" aria-label={labels.controls}>
          <button type="button" aria-label={labels.previous} aria-controls={trackId} disabled={current === 0} onClick={() => move(-1)}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="zibi-editorial-slider__dots">
            {slideNames.map((name, slide) => (
              <button
                key={artists[slide].slug}
                type="button"
                aria-label={formatMessage(labels.showSlide, { name })}
                aria-current={slide === current ? 'true' : undefined}
                aria-controls={trackId}
                onClick={() => setIndex(slide)}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" aria-label={labels.next} aria-controls={trackId} disabled={current === lastIndex} onClick={() => move(1)}>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      {lastIndex > 0 && <span className="sr-only" aria-live="polite">{slideLabel(current)}</span>}
    </div>
  );
}
