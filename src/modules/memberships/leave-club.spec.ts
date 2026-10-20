import { leaveClubData } from './leave-club.js';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('leaveClubData', () => {
  it('revoca el consentimiento con la fecha si lo tenía', () => {
    expect(leaveClubData({ marketingConsent: true }, NOW)).toEqual({
      leftAt: NOW,
      marketingConsent: false,
      marketingConsentRevokedAt: NOW,
    });
  });

  it('sin consentimiento no inventa una fecha de revocación', () => {
    expect(leaveClubData({ marketingConsent: false }, NOW)).toEqual({
      leftAt: NOW,
      marketingConsent: false,
    });
  });
});
