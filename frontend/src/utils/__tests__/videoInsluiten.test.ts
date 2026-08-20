/**
 * Bij een oproep mag een vereniging een link of filmpje meegeven. Die tekst komt
 * van een andere vereniging, dus hij mag nooit rechtstreeks in de src van een
 * iframe belanden. Deze tests leggen vast dat er alleen een id uit komt dat we
 * zelf herkennen, en dat al het andere als gewone link wordt behandeld.
 */

import { describe, it, expect } from 'vitest';
import { youtubeVideoId, youtubeInsluitUrl, isVeiligeLink } from '../videoInsluiten';

describe('youtubeVideoId', () => {
  it('herkent een gewone kijk-link', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=izQsgE0L450')).toBe('izQsgE0L450');
  });

  it('herkent een verkorte link', () => {
    expect(youtubeVideoId('https://youtu.be/izQsgE0L450')).toBe('izQsgE0L450');
  });

  it('herkent een insluit-link', () => {
    expect(youtubeVideoId('https://www.youtube.com/embed/izQsgE0L450')).toBe('izQsgE0L450');
  });

  it('negeert de overige parameters', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=izQsgE0L450&t=42s&list=PL123')).toBe('izQsgE0L450');
  });

  it('geeft niets terug bij een ander webadres', () => {
    expect(youtubeVideoId('https://vimeo.com/12345')).toBeNull();
  });

  it('trapt niet in een hostnaam die er alleen op lijkt', () => {
    expect(youtubeVideoId('https://youtube.com.kwaadaardig.nl/watch?v=izQsgE0L450')).toBeNull();
    expect(youtubeVideoId('https://notyoutube.com/watch?v=izQsgE0L450')).toBeNull();
  });

  it('weigert javascript: en data:', () => {
    expect(youtubeVideoId('javascript:alert(1)')).toBeNull();
    expect(youtubeVideoId('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('weigert een id met de verkeerde vorm', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=../../etc/passwd')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/watch?v=teKort')).toBeNull();
    expect(youtubeVideoId('https://youtu.be/izQsgE0L450/extra')).toBeNull();
  });

  it('gaat om met leeg en onzin', () => {
    expect(youtubeVideoId(null)).toBeNull();
    expect(youtubeVideoId('')).toBeNull();
    expect(youtubeVideoId('geen url')).toBeNull();
  });
});

describe('youtubeInsluitUrl', () => {
  it('bouwt de url zelf op', () => {
    expect(youtubeInsluitUrl('izQsgE0L450')).toBe('https://www.youtube-nocookie.com/embed/izQsgE0L450');
  });
});

describe('isVeiligeLink', () => {
  it('laat http en https door', () => {
    expect(isVeiligeLink('https://imslp.org/wiki/Adagio')).toBe(true);
    expect(isVeiligeLink('http://voorbeeld.nl')).toBe(true);
  });

  it('houdt de rest tegen', () => {
    expect(isVeiligeLink('javascript:alert(1)')).toBe(false);
    expect(isVeiligeLink('data:text/html,x')).toBe(false);
    expect(isVeiligeLink('file:///etc/passwd')).toBe(false);
    expect(isVeiligeLink(null)).toBe(false);
  });
});
