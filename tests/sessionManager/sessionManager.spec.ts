import { SessionManager } from '../../src/sessionManager.js';
import { UnifiApiError, UnifiAuthError, UnifiNetworkError } from '../../src/models/unifiTypes.js';
import { Logger } from 'homebridge';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Axios, { AxiosInstance } from 'axios';
import { UnifiApiType } from '../../src/api/unifiApiHelper.js';

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

  it('should throw UnifiAuthError on failed authentication', async () => {
    const badSession = new SessionManager('host', 'baduser', 'badpass', log);
    vi.spyOn(badSession as any, 'axiosInstance', 'get').mockReturnValue({
      post: vi.fn().mockRejectedValue(new Error('Auth failed')),
      defaults: { headers: { common: {} } },
    });
    await expect(badSession.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(badSession.authenticate()).rejects.toMatchObject({
      message: expect.stringContaining('Failed to detect UniFi API structure during authentication'),
      cause: expect.any(Error)
    });
  });

  it('should throw UnifiApiError on site loading with malformed data', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: null } });
    await expect(session['loadSites']()).rejects.toBeInstanceOf(UnifiApiError);
    await expect(session['loadSites']()).rejects.toMatchObject({
      message: expect.stringContaining('Unexpected site list structure'),
      cause: expect.anything(),
    });
  });

  it('should warn on unknown site', () => {
    expect(session.getSiteName('unknown')).toBeUndefined();
  });

  it('should return available site pairs', () => {
    (session as any).siteMap.set('desc', 'site1');
    (session as any).siteMap.set('site1', 'site1');
    expect(session.getAvailableSitePairs()).toContain('desc (site1)');
  });

  it('should throw UnifiNetworkError on ECONNREFUSED', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => {
      const err = new Error('fail') as any;
      err.code = 'ECONNREFUSED';
      throw err;
    });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiNetworkError);
    await expect(session.request({})).rejects.toMatchObject({
      message: expect.stringContaining('Network error communicating with UniFi controller'),
      cause: expect.any(Error),
    });
  });

  it('should throw UnifiNetworkError on ENOTFOUND', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => {
      const err = new Error('fail') as any;
      err.code = 'ENOTFOUND';
      throw err;
    });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiNetworkError);
    await expect(session.request({})).rejects.toMatchObject({
      message: expect.stringContaining('Network error communicating with UniFi controller'),
      cause: expect.any(Error),
    });
  });

  it('should throw UnifiApiError on generic API error', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError);
    await expect(session.request({})).rejects.toMatchObject({
      message: expect.stringContaining('API request failed'),
      cause: expect.any(Error),
    });
  });

  it('should throw UnifiAuthError if UniFi OS login returns no cookies', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).apiHelper.apiType = UnifiApiType.UnifiOS;
    const post = vi.fn().mockResolvedValue({ headers: {} });
    vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any);
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(session.authenticate()).rejects.toMatchObject({
      message: 'Failed to authenticate with UniFi controller',
      cause: expect.objectContaining({
        message: 'No cookies returned from UniFi OS login',
        name: 'UnifiAuthError',
      }),
    });
  });

  it('should throw UnifiAuthError if UniFi OS login returns malformed token', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).apiHelper.apiType = UnifiApiType.UnifiOS;
    const setCookie = ['TOKEN=badtoken'];
    const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } });
    vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any);
    vi.spyOn(require('jsonwebtoken'), 'decode').mockImplementation(() => { throw new Error('decode fail'); });
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(session.authenticate()).rejects.toMatchObject({
      message: 'Failed to authenticate with UniFi controller',
      cause: expect.objectContaining({
        message: expect.stringContaining('Malformed cookie or token'),
        name: 'UnifiAuthError',
      }),
    });
  });

  it('should throw UnifiAuthError if UniFi OS login returns no CSRF token', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).apiHelper.apiType = UnifiApiType.UnifiOS;
    const setCookie = ['TOKEN=validtoken'];
    const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } });
    vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any);
    vi.spyOn(require('jsonwebtoken'), 'decode').mockReturnValue({});
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(session.authenticate()).rejects.toMatchObject({
      message: 'Failed to authenticate with UniFi controller',
      cause: expect.objectContaining({
        message: 'CSRF token not found.',
        name: 'UnifiAuthError',
      }),
    });
  });

  it('should throw UnifiAuthError if self-hosted login returns no cookies', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).apiHelper.apiType = UnifiApiType.SelfHosted;
    const post = vi.fn().mockResolvedValue({ headers: {} });
    vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any);
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(session.authenticate()).rejects.toMatchObject({
      message: 'Failed to authenticate with UniFi controller',
      cause: expect.objectContaining({
        message: 'No cookies returned from self-hosted login',
        name: 'UnifiAuthError',
      }),
    });
  });

  it('should throw UnifiAuthError if error thrown during login', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).apiHelper.apiType = UnifiApiType.SelfHosted;
    const post = vi.fn().mockRejectedValue(new Error('login fail'));
    vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any);
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(session.authenticate()).rejects.toMatchObject({
      message: expect.stringContaining('Failed to authenticate with UniFi controller'),
      cause: expect.any(Error),
    });
  });

  it('should retry request on 401 and succeed', async () => {
    let call = 0;
    (session as any).axiosInstance = vi.fn().mockImplementation(() => {
      if (call++ === 0) {
        const err: any = new Error('401');
        err.response = { status: 401 };
        throw err;
      }
      return 'ok';
    });
    vi.spyOn(session, 'authenticate').mockResolvedValue(undefined);
    const result = await session.request({});
    expect(result).toBe('ok');
  });

  it('should rethrow already custom error in request', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => {
      throw new UnifiApiError('fail');
    });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError);
  });

  it('should rethrow UnifiAuthError in request', async () => {
    const err = new UnifiAuthError('auth fail');
    (session as any).axiosInstance = vi.fn().mockImplementation(() => { throw err; });
    await expect(session.request({})).rejects.toBe(err);
  });

  it('should rethrow UnifiNetworkError in request', async () => {
    const err = new UnifiNetworkError('network fail');
    (session as any).axiosInstance = vi.fn().mockImplementation(() => { throw err; });
    await expect(session.request({})).rejects.toBe(err);
  });

  it('getAvailableSitePairs returns empty array for empty map', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).siteMap.clear();
    expect(session.getAvailableSitePairs()).toEqual([]);
  });

  it('getAvailableSitePairs with multiple duplicate values and mixed keys', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).siteMap.set('a', 'x');
    (session as any).siteMap.set('b', 'x');
    (session as any).siteMap.set('c', 'y');
    (session as any).siteMap.set('d', 'y');
    (session as any).siteMap.set('e', 'e');
    expect(session.getAvailableSitePairs()).toEqual(['a (x)', 'c (y)']);
  });

  it('should map sites with desc and name, only desc, only name, or neither', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    const sites = [
      { desc: 'desc1', name: 'site1' },
      { desc: 'desc2' },
      { name: 'site3' },
      {},
    ];
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: sites } });
    await session['loadSites']();
    expect((session as any).siteMap.get('desc1')).toBe('site1');
    expect((session as any).siteMap.get('site1')).toBe('site1');
    expect((session as any).siteMap.get('desc2')).toBeUndefined();
    expect((session as any).siteMap.get('site3')).toBe('site3');
  });

  it('should log and rethrow UnifiApiError in loadSites', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    const err = new UnifiApiError('fail');
    vi.spyOn(session, 'request').mockRejectedValue(err);
    await expect(session['loadSites']()).rejects.toBe(err);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load site list from /api/self/sites: fail'));
  });

  it('should log and wrap non-UnifiApiError in loadSites', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    vi.spyOn(session, 'request').mockRejectedValue(new Error('fail'));
    await expect(session['loadSites']()).rejects.toBeInstanceOf(UnifiApiError);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load site list from /api/self/sites: fail'));
  });

  it('should warn on unknown site in getSiteName', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    session.getSiteName('unknown');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Configured site "unknown" not recognized'));
  });

  it('should return available site pairs for various combinations', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).siteMap.set('desc', 'site1');
    (session as any).siteMap.set('site1', 'site1');
    (session as any).siteMap.set('desc2', 'site2');
    (session as any).siteMap.set('site2', 'site2');
    (session as any).siteMap.set('desc3', 'site3');
    expect(session.getAvailableSitePairs()).toEqual(
      expect.arrayContaining(['desc (site1)', 'desc2 (site2)', 'desc3 (site3)'])
    );
  });

  it('constructor initializes properties', () => {
    const s = new SessionManager('h', 'u', 'p', log);
    expect((s as any).host).toBe('h');
    expect((s as any).username).toBe('u');
    expect((s as any).password).toBe('p');
    expect((s as any).log).toBe(log);
    expect((s as any).siteMap).toBeInstanceOf(Map);
    expect(s.getApiHelper()).toBeInstanceOf(Object);
  });

  it('getApiHelper returns apiHelper', () => {
    expect(session.getApiHelper()).toBe((session as any).apiHelper);
  });

  it('getSiteName returns undefined for empty/undefined', () => {
    expect(session.getSiteName(undefined as any)).toBeUndefined();
    expect(session.getSiteName('')).toBeUndefined();
  });

  it('loadSites with empty array clears map', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).siteMap.set('desc', 'site1');
    (session as any).siteMap.set('site1', 'site1');
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: [] } });
    await session['loadSites']();
    expect((session as any).siteMap.size).toBe(0);
  });

  it('loadSites with desc=name only sets one entry', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    const sites = [ { desc: 'site1', name: 'site1' } ];
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: sites } });
    await session['loadSites']();
    expect((session as any).siteMap.get('site1')).toBe('site1');
    expect((session as any).siteMap.get('desc')).toBeUndefined();
  });

  it('authenticate wraps detectApiType error in UnifiAuthError', async () => {
    const s = new SessionManager('h', 'u', 'p', log);
    vi.spyOn((s as any).apiHelper, 'getApiType').mockReturnValue(null);
    vi.spyOn((s as any).apiHelper, 'detectApiType').mockRejectedValue(new Error('detect fail'));
    await expect(s.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(s.authenticate()).rejects.toMatchObject({
      message: expect.stringContaining('Failed to detect UniFi API structure during authentication'),
      cause: expect.any(Error),
    });
  });

  it('request throws UnifiAuthError if not authenticated', async () => {
    const s = new SessionManager('h', 'u', 'p', log);
    (s as any).axiosInstance = null;
    await expect(s.request({})).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(s.request({})).rejects.toMatchObject({
      message: expect.stringContaining('Cannot make API request: No authenticated session.'),
    });
  });

  it('getSiteName logs for undefined/empty input with empty siteMap', () => {
    log.warn = vi.fn();
    const session = new SessionManager('host', 'user', 'pass', log);
    expect(session.getSiteName(undefined as any)).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Configured site "undefined" not recognized'));
    // Reset log.warn for next check
    log.warn = vi.fn();
    expect(session.getSiteName('')).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Configured site "" not recognized'));
  });

  it('getAvailableSitePairs returns empty for only self-mapping entries', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).siteMap.set('site1', 'site1');
    (session as any).siteMap.set('site2', 'site2');
    expect(session.getAvailableSitePairs()).toEqual([]);
  });

  it('loadSites ignores site objects with no desc and no name', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    const sites = [ { desc: 'desc1', name: 'site1' }, {}, { name: 'site2' } ];
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: sites } });
    await session['loadSites']();
    expect((session as any).siteMap.get('desc1')).toBe('site1');
    expect((session as any).siteMap.get('site2')).toBe('site2');
    expect(Array.from((session as any).siteMap.keys())).not.toContain(undefined);
  });

  it('request wraps thrown string as UnifiApiError', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => { throw 'fail'; });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError);
    await expect(session.request({})).rejects.toMatchObject({
      message: expect.stringContaining('API request failed'),
      cause: expect.anything(),
    });
  });

  it('request wraps thrown plain object as UnifiApiError', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => { throw { foo: 'bar' }; });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError);
    await expect(session.request({})).rejects.toMatchObject({
      message: expect.stringContaining('API request failed'),
      cause: expect.anything(),
    });
  });

  it('authenticate wraps Axios.create error in UnifiAuthError', async () => {
    const origCreate = Axios.create;
    vi.spyOn(Axios, 'create').mockImplementation(() => { throw new Error('fail'); });
    const session = new SessionManager('host', 'user', 'pass', log);
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    vi.spyOn(Axios, 'create').mockImplementation(origCreate);
  });

  it('loadSites logs loaded site keys', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    const sites = [ { desc: 'desc1', name: 'site1' }, { name: 'site2' } ];
    vi.spyOn(session, 'request').mockResolvedValue({ data: { data: sites } });
    await session['loadSites']();
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Loaded sites'));
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('desc1'));
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('site2'));
  });

  it('constructor does not throw with undefined logger', () => {
    expect(() => new SessionManager('h', 'u', 'p', undefined as any)).not.toThrow();
  });

  it('authenticate throws if set-cookie present but missing TOKEN (UnifiOS)', async () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).apiHelper.apiType = UnifiApiType.UnifiOS;
    const setCookie = ['SOMETHING=foo'];
    const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } });
    vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any);
    vi.spyOn(require('jsonwebtoken'), 'decode').mockReturnValue({});
    await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError);
    await expect(session.authenticate()).rejects.toMatchObject({
      message: 'Failed to authenticate with UniFi controller',
      cause: expect.objectContaining({
        message: 'CSRF token not found.',
        name: 'UnifiAuthError',
      }),
    });
  });

  it('getAvailableSitePairs deduplicates multiple keys to same value and all self-mapping', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    (session as any).siteMap.set('a', 'x');
    (session as any).siteMap.set('b', 'x');
    (session as any).siteMap.set('c', 'c');
    (session as any).siteMap.set('d', 'd');
    expect(session.getAvailableSitePairs()).toEqual(['a (x)']); // Only first key for value 'x'
    (session as any).siteMap.clear();
    (session as any).siteMap.set('e', 'e');
    (session as any).siteMap.set('f', 'f');
    expect(session.getAvailableSitePairs()).toEqual([]);
  });

  it('request wraps thrown generic Error as UnifiApiError', async () => {
    (session as any).axiosInstance = vi.fn().mockImplementation(() => { throw new Error('generic'); });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError);
    await expect(session.request({})).rejects.toMatchObject({
      message: expect.stringContaining('API request failed'),
      cause: expect.any(Error),
    });
  });

  it('request wraps thrown symbol as UnifiApiError', async () => {
    const sym = Symbol('fail');
    (session as any).axiosInstance = vi.fn().mockImplementation(() => { throw sym; });
    await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError);
  });

  it('calls all public methods for coverage', () => {
    const session = new SessionManager('host', 'user', 'pass', log);
    expect(typeof session.getApiHelper()).toBe('object');
    expect(session.getSiteName('nonexistent')).toBeUndefined();
    expect(Array.isArray(session.getAvailableSitePairs())).toBe(true);
  });

  it('constructor with all argument types', () => {
    expect(() => new SessionManager('host', 'user', 'pass', log)).not.toThrow();
    expect(() => new SessionManager('', '', '', log)).not.toThrow();
    expect(() => new SessionManager('host', 'user', 'pass', undefined as any)).not.toThrow();
  });
});
