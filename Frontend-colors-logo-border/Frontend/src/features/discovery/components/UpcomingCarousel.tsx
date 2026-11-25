import { useId, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { ZibiMark } from '@/components/brand/ZibiLogo';
import { MediaContainer } from '@/components/media/MediaContainer';
import type { ArtistSummary } from '@/types/models';
import { normalizeHandle, publicMediaUrl } from '@/utils/url';
import { artistStorefrontPath } from '../artists';

export function UpcomingCarousel({ artists }: { artists: ArtistSummary[] }) {
  const { t, formatMessage } = useLanguage();
  const labels = t.discovery.carousel;
  const trackId = useId();
  const [index, setIndex] = useState(0);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastSwipe = useRef(-Infinity);
  const lastIndex = artists.length;
  const current = Math.min(index, lastIndex);
  const slideNames = [...artists.map((artist) => artist.displayName), t.discovery.promo.title];

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
          {artists.map((artist, slide) => {
            const handle = normalizeHandle(artist.handle);
            return (
              <article
                className="zibi-editorial-slide"
                key={artist.storefrontId}
                aria-roledescription={labels.slide}
                aria-label={slideLabel(slide)}
                aria-hidden={slide !== current ? true : undefined}
                inert={slide !== current}
              >
                <div className="zibi-editorial-slide__art" aria-hidden="true">
                  <MediaContainer src={publicMediaUrl(artist.profileImageUrl)} alt="" aspectRatio="4x3" accentTone="terracotta" monogram={artist.displayName} />
                </div>
                <div className="zibi-editorial-slide__copy">
                  <p className="zibi-editorial-slide__handle">@{handle}</p>
                  <h3>{artist.displayName}</h3>
                  {artist.bio && <p className="zibi-editorial-slide__bio">{artist.bio}</p>}
                  <Link
                    className="zibi-editorial-slide__link"
                    to={artistStorefrontPath(handle)}
                    aria-label={formatMessage(t.discovery.visitArtist, { name: artist.displayName })}
                  >
                    {t.discovery.discoverArtist}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
          <article
            className="zibi-editorial-slide zibi-editorial-slide--promo"
            aria-roledescription={labels.slide}
            aria-label={slideLabel(lastIndex)}
            aria-hidden={current !== lastIndex ? true : undefined}
            inert={current !== lastIndex}
          >
            <div className="zibi-editorial-slide__art zibi-editorial-slide__art--promo" aria-hidden="true">
              <ZibiMark size={148} decorative />
            </div>
            <div className="zibi-editorial-slide__copy">
              <h3>{t.discovery.promo.title}</h3>
              <p className="zibi-editorial-slide__bio">{t.discovery.promo.description}</p>
              <a className="zibi-editorial-slide__link" href="#all-artists">
                {t.discovery.promo.action}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
          </article>
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
                key={slide < lastIndex ? artists[slide].storefrontId : 'promo'}
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
