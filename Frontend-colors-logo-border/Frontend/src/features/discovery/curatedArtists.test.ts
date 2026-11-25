/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { popularArtists, searchCuratedArtists, upcomingArtists } from './artists';
import { curatedArtists, genreCategories } from './curatedArtists';

describe('curated artist catalog', () => {
  it('contains 24 distinct artists distributed across the four supplied genres', () => {
    expect(curatedArtists).toHaveLength(24);
    expect(new Set(curatedArtists.map(({ slug }) => slug)).size).toBe(24);
    expect(new Set(curatedArtists.map(({ name }) => name)).size).toBe(24);
    expect(popularArtists).toHaveLength(19);
    expect(upcomingArtists.map(({ name }) => name)).toEqual(['King Luca', 'Lili Anoma', 'Mic Monsta', 'Askia', 'Eemel']);
    for (const genre of genreCategories) {
      expect(curatedArtists.filter(({ genreCategory }) => genreCategory === genre)).toHaveLength(6);
    }
    expect(curatedArtists.every(({ bio, songs }) => bio.length > 0 && songs.length > 0)).toBe(true);
  });

  it('finds artists by name regardless of punctuation, case and spacing', () => {
    expect(searchCuratedArtists('MR LEO').map(({ slug }) => slug)).toEqual(['mr-leo']);
    expect(searchCuratedArtists("Mink’s").map(({ slug }) => slug)).toEqual(['minks']);
    expect(searchCuratedArtists('Charlotte').map(({ slug }) => slug)).toEqual(['charlotte-dipanda']);
  });

  it('maps each source file to a distinct JPEG using only exact names or explicit aliases', () => {
    const aliases: Record<string, string> = {
      'blanche-bailly': 'pics/blanche bailey.jpg',
      'charlotte-dipanda': 'pics/charlotte depanda.jpg',
      'lili-anoma': 'pics/lil anoma.jpg',
      'tzy-panchak': 'pics/tzy panchack.jpg',
      'ko-c': 'ARTISTS/KOCEE.jpg',
      'mic-monsta': 'ARTISTS/MIC MONSTER.jpg',
    };
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const sources = new Set<string>();
    const digests = new Set<string>();
    for (const { name, slug, image } of curatedArtists) {
      expect(image, name).not.toBeNull();
      if (!image) continue;
      const alias = aliases[slug];
      if (alias) expect(image.source).toBe(alias);
      else expect(normalize(basename(image.source).replace(/\.jpg$/i, ''))).toBe(normalize(name));
      sources.add(image.source);
      expect(image.src).toBe(`/assets/artists/${slug}.jpg`);
      const bytes = readFileSync(resolve(import.meta.dirname, '../../../public', image.src.slice(1)));
      expect([bytes[0], bytes[1]]).toEqual([255, 216]);
      digests.add(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(sources.size).toBe(24);
    expect(digests.size).toBe(24);
  });
});
