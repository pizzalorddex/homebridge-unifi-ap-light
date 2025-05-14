import { describe, it, expect, beforeEach, vi } from 'vitest';
// Integration test scaffold for SessionManager (to be expanded with mocks)
import { SessionManager } from '../../src/sessionManager.js';
import { Logger } from 'homebridge';

describe('SessionManager', () => {
  let session: SessionManager;
  let log: Logger;

  beforeEach(() => {
    log = { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
    session = new SessionManager('host', 'user', 'pass', log);
  });

  it('should instantiate and expose API helper', () => {
    expect(session.getApiHelper()).toBeDefined();
  });

  it('should throw on failed authentication', async () => {
    const badSession = new SessionManager('host', 'baduser', 'badpass', log);
    // Mock Axios to reject
    vi.spyOn(badSession as any, 'axiosInstance', 'get').mockReturnValue({
      post: vi.fn().mockRejectedValue(new Error('Auth failed')),
      defaults: { headers: { common: {} } },
    });
    await expect(badSession.authenticate()).rejects.toThrow();
  });

  it('should handle site loading with malformed data', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: null } });
    await expect(session['loadSites']()).rejects.toThrow();
  });

  it('should warn on unknown site', () => {
    expect(session.getSiteName('unknown')).toBeUndefined();
  });

  it('should return available site pairs', () => {
    (session as any).siteMap.set('desc', 'site1');
    (session as any).siteMap.set('site1', 'site1');
    expect(session.getAvailableSitePairs()).toContain('desc (site1)');
  });

  // More tests will be added with Axios and API mocks
});
