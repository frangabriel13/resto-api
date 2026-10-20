import { googleReviewUrlSchema } from './merchant-fields.js';

describe('googleReviewUrlSchema', () => {
  it.each([
    'https://g.page/r/CafeDemo/review',
    'https://search.google.com/local/writereview?placeid=abc',
    'https://www.google.com/maps/place/Cafe',
    'https://www.google.com.ar/search?q=cafe',
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/abc123',
  ])('acepta %s', (url) => {
    expect(googleReviewUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    'http://g.page/r/CafeDemo/review',
    'https://evil.com/g.page',
    'https://google.com.evil.com/review',
    'https://notgoogle.com/review',
    'https://g.page.evil.com',
  ])('rechaza %s', (url) => {
    expect(googleReviewUrlSchema.safeParse(url).success).toBe(false);
  });
});
