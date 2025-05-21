import { SessionManager } from '../../src/utils/sessionManager.js'
import { UnifiApiError, UnifiAuthError, UnifiNetworkError } from '../../src/models/unifiTypes.js'
import { Logger } from 'homebridge'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Axios from 'axios'
import { UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { mockLogger } from '../fixtures/homebridgeMocks.js'
import { mockAxiosResponse } from '../fixtures/apiFixtures'

// Removed local mockAxiosResponse definition

describe('SessionManager', () => {
	let log: Logger
	beforeEach(() => {
		log = mockLogger as any
		Object.values(mockLogger).forEach(fn => fn.mockClear && fn.mockClear())
	})

	describe('Construction & API Helper', () => {
		it('constructor initializes properties', () => {
			const s = new SessionManager('h', 'u', 'p', log)
			expect((s as any).host).toBe('h')
			expect((s as any).username).toBe('u')
			expect((s as any).password).toBe('p')
			expect((s as any).log).toBe(log)
			expect((s as any).siteMap).toBeInstanceOf(Map)
			expect(s.getApiHelper()).toBeInstanceOf(Object)
		})
		it('constructor with all argument types', () => {
			expect(() => new SessionManager('host', 'user', 'pass', log)).not.toThrow()
			expect(() => new SessionManager('', '', '', log)).not.toThrow()
			expect(() => new SessionManager('host', 'user', 'pass', undefined as any)).not.toThrow()
		})
		it('constructor does not throw with undefined logger', () => {
			expect(() => new SessionManager('h', 'u', 'p', undefined as any)).not.toThrow()
		})
		it('getApiHelper returns apiHelper', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(session.getApiHelper()).toBe((session as any).apiHelper)
		})
		it('should instantiate and expose API helper', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(session.getApiHelper()).toBeDefined()
		})
	})

	describe('Authentication', () => {
		describe('Error Handling', () => {
			it('should throw UnifiAuthError on failed authentication', async () => {
				const badSession = new SessionManager('host', 'baduser', 'badpass', log)
				vi.spyOn(badSession as any, 'axiosInstance', 'get').mockReturnValue({
					post: vi.fn().mockRejectedValue(new Error('Auth failed')),
					defaults: { headers: { common: {} } },
				})
				await expect(badSession.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(badSession.authenticate()).rejects.toMatchObject({
					message: expect.stringContaining('Failed to detect UniFi API structure during authentication'),
					cause: expect.any(Error),
				})
			})
			it('authenticate wraps detectApiType error in UnifiAuthError', async () => {
				const s = new SessionManager('h', 'u', 'p', log)
				vi.spyOn((s as any).apiHelper, 'getApiType').mockReturnValue(null)
				vi.spyOn((s as any).apiHelper, 'detectApiType').mockRejectedValue(new Error('detect fail'))
				await expect(s.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(s.authenticate()).rejects.toMatchObject({
					message: expect.stringContaining('Failed to detect UniFi API structure during authentication'),
					cause: expect.any(Error),
				})
			})
			it('authenticate wraps Axios.create error in UnifiAuthError', async () => {
				const origCreate = Axios.create
				vi.spyOn(Axios, 'create').mockImplementation(() => { throw new Error('fail') })
				const session = new SessionManager('host', 'user', 'pass', log)
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				vi.spyOn(Axios, 'create').mockImplementation(origCreate)
			})
		})
		describe('UniFi OS', () => {
			it('should throw UnifiAuthError if UniFi OS login returns no cookies', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.UnifiOS
				const post = vi.fn().mockResolvedValue({ headers: {} })
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(session.authenticate()).rejects.toMatchObject({
					message: 'Failed to authenticate with UniFi controller',
					cause: expect.objectContaining({
						message: 'No cookies returned from UniFi OS login',
						name: 'UnifiAuthError',
					}),
				})
			})
			it('should throw UnifiAuthError if UniFi OS login returns malformed token', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.UnifiOS
				const setCookie = ['TOKEN=badtoken']
				const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } })
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
				vi.spyOn(require('jsonwebtoken'), 'decode').mockImplementation(() => { throw new Error('decode fail') })
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(session.authenticate()).rejects.toMatchObject({
					message: 'Failed to authenticate with UniFi controller',
					cause: expect.objectContaining({
						message: expect.stringContaining('Malformed cookie or token'),
						name: 'UnifiAuthError',
					}),
				})
			})
			it('should throw UnifiAuthError if UniFi OS login returns no CSRF token', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.UnifiOS
				const setCookie = ['TOKEN=validtoken']
				const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } })
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
				vi.spyOn(require('jsonwebtoken'), 'decode').mockReturnValue({})
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(session.authenticate()).rejects.toMatchObject({
					message: 'Failed to authenticate with UniFi controller',
					cause: expect.objectContaining({
						message: 'CSRF token not found.',
						name: 'UnifiAuthError',
					}),
				})
			})
			it('authenticate throws if set-cookie present but missing TOKEN (UnifiOS)', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.UnifiOS
				const setCookie = ['SOMETHING=foo']
				const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } })
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
				vi.spyOn(require('jsonwebtoken'), 'decode').mockReturnValue({})
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(session.authenticate()).rejects.toMatchObject({
					message: 'Failed to authenticate with UniFi controller',
					cause: expect.objectContaining({
						message: 'CSRF token not found.',
						name: 'UnifiAuthError',
					}),
				})
			})
			it('should authenticate successfully with UniFi OS and set headers', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.UnifiOS
				// Simulate a valid JWT and CSRF token
				const csrfToken = 'csrf-token-123'
				const setCookie = ['TOKEN=validtoken; Path=/; HttpOnly;']
				const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } })
				const defaults = { headers: { common: {} } }
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults } as any)
				vi.spyOn(require('jsonwebtoken'), 'decode').mockReturnValue({ csrfToken })
				// Mock loadSites to avoid side effects
				vi.spyOn(session as any, 'loadSites').mockResolvedValue(undefined)
				await expect(session.authenticate()).resolves.toBeUndefined()
				// Check that headers are set
				expect(defaults.headers.common['X-Csrf-Token']).toBe(csrfToken)
				expect(defaults.headers.common['Cookie']).toContain('TOKEN=validtoken')
				// Should call /api/auth/login with correct payload
				expect(post).toHaveBeenCalledWith('/api/auth/login', {
					username: 'user',
					password: 'pass',
					rememberMe: true,
				})
			})
		})
		describe('Self-Hosted', () => {
			it('should throw UnifiAuthError if self-hosted login returns no cookies', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.SelfHosted
				const post = vi.fn().mockResolvedValue({ headers: {} })
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(session.authenticate()).rejects.toMatchObject({
					message: 'Failed to authenticate with UniFi controller',
					cause: expect.objectContaining({
						message: 'No cookies returned from self-hosted login',
						name: 'UnifiAuthError',
					}),
				})
			})
			it('should throw UnifiAuthError if error thrown during login', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.SelfHosted
				const post = vi.fn().mockRejectedValue(new Error('login fail'))
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
				await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
				await expect(session.authenticate()).rejects.toMatchObject({
					message: expect.stringContaining('Failed to authenticate with UniFi controller'),
					cause: expect.any(Error),
				})
			})
			it('should authenticate successfully with self-hosted controller and set headers', async () => {
				const session = new SessionManager('host', 'user', 'pass', log);
				(session as any).apiHelper.apiType = UnifiApiType.SelfHosted
				// Simulate a valid session cookie
				const setCookie = ['unifises=validsession; Path=/; HttpOnly;']
				const post = vi.fn().mockResolvedValue({ headers: { 'set-cookie': setCookie } })
				const defaults = { headers: { common: {} } }
				vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults } as any)
				// Mock loadSites to avoid side effects
				vi.spyOn(session as any, 'loadSites').mockResolvedValue(undefined)
				await expect(session.authenticate()).resolves.toBeUndefined()
				// Check that headers are set
				expect(defaults.headers.common['Cookie']).toContain('unifises=validsession')
				// Should call /api/login with correct payload
				expect(post).toHaveBeenCalledWith('/api/login', {
					username: 'user',
					password: 'pass',
				})
			})
		})
		describe('Concurrency', () => {
			it('handles multiple concurrent authenticate calls (race condition)', async () => {
				const session = new SessionManager('host', 'user', 'pass', log)
				let resolve: () => void = () => {}
				const authPromise = new Promise<void>(res => { resolve = res })
				vi.spyOn(session, 'authenticate').mockImplementation(() => authPromise)
				// Simulate two concurrent requests that both trigger authenticate
				const req1 = session.authenticate()
				const req2 = session.authenticate()
				// Both should resolve when the promise resolves
				setTimeout(() => resolve(), 10)
				await expect(req1).resolves.toBeUndefined()
				await expect(req2).resolves.toBeUndefined()
			})
		})
	})

	describe('Request Handling', () => {
		it('should throw UnifiNetworkError on ECONNREFUSED', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => {
				const err = new Error('fail') as any
				err.code = 'ECONNREFUSED'
				throw err
			})
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiNetworkError)
			await expect(session.request({})).rejects.toMatchObject({
				message: expect.stringContaining('Network error communicating with UniFi controller'),
				cause: expect.any(Error),
			})
		})
		it('should throw UnifiNetworkError on ENOTFOUND', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => {
				const err = new Error('fail') as any
				err.code = 'ENOTFOUND'
				throw err
			})
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiNetworkError)
			await expect(session.request({})).rejects.toMatchObject({
				message: expect.stringContaining('Network error communicating with UniFi controller'),
				cause: expect.any(Error),
			})
		})
		it('should throw UnifiApiError on generic API error', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => {
				throw new Error('fail')
			})
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError)
			await expect(session.request({})).rejects.toMatchObject({
				message: expect.stringContaining('API request failed'),
				cause: expect.any(Error),
			})
		})
		it('should retry request on 401 and succeed', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			let call = 0;
			(session as any).axiosInstance = vi.fn().mockImplementation(() => {
				if (call++ === 0) {
					const err: any = new Error('401')
					err.response = { status: 401 }
					throw err
				}
				return 'ok'
			})
			vi.spyOn(session, 'authenticate').mockResolvedValue(undefined)
			const result = await session.request({})
			expect(result).toBe('ok')
		})
		it('should rethrow already custom error in request', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => {
				throw new UnifiApiError('fail')
			})
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError)
		})
		it('should rethrow UnifiAuthError in request', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const err = new UnifiAuthError('auth fail');
			(session as any).axiosInstance = vi.fn().mockImplementation(() => { throw err })
			await expect(session.request({})).rejects.toBe(err)
		})
		it('should rethrow UnifiNetworkError in request', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const err = new UnifiNetworkError('network fail');
			(session as any).axiosInstance = vi.fn().mockImplementation(() => { throw err })
			await expect(session.request({})).rejects.toBe(err)
		})
		it('request throws UnifiAuthError if not authenticated', async () => {
			const s = new SessionManager('h', 'u', 'p', log);
			(s as any).axiosInstance = null
			await expect(s.request({})).rejects.toBeInstanceOf(UnifiAuthError)
			await expect(s.request({})).rejects.toMatchObject({
				message: expect.stringContaining('Cannot make API request: No authenticated session.'),
			})
		})
		it('request wraps thrown string as UnifiApiError', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => { throw 'fail' })
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError)
			await expect(session.request({})).rejects.toMatchObject({
				message: expect.stringContaining('API request failed'),
				cause: expect.anything(),
			})
		})
		it('request wraps thrown plain object as UnifiApiError', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => { throw { foo: 'bar' } })
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError)
			await expect(session.request({})).rejects.toMatchObject({
				message: expect.stringContaining('API request failed'),
				cause: expect.anything(),
			})
		})
		it('request wraps thrown generic Error as UnifiApiError', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).axiosInstance = vi.fn().mockImplementation(() => { throw new Error('generic') })
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError)
			await expect(session.request({})).rejects.toMatchObject({
				message: expect.stringContaining('API request failed'),
				cause: expect.any(Error),
			})
		})
		it('request wraps thrown symbol as UnifiApiError', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const sym = Symbol('fail');
			(session as any).axiosInstance = vi.fn().mockImplementation(() => { throw sym })
			await expect(session.request({})).rejects.toBeInstanceOf(UnifiApiError)
		})
		it('retries authentication and request on session expiration (401)', async () => {
			const { mockLoggerFull } = await import('../fixtures/homebridgeMocks')
			const session = new SessionManager('host', 'user', 'pass', mockLoggerFull as any)
			let callCount = 0
			const validResponse = {
				data: { data: [{ _id: 'ap1', type: 'uap' }] },
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
			}
			// Use an inline disable for the unused argument warning
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			;(session as any).axiosInstance = vi.fn(async function (_config) {
				if (callCount++ === 0) {
					const err: any = new Error('401')
					err.response = { status: 401 }
					throw err
				}
				return validResponse
			})
			vi.spyOn(session, 'authenticate').mockResolvedValue(undefined)
			const result = await session.request({ method: 'get', url: '/api/s/site1/rest/device' })
			expect(result).toEqual(validResponse)
			expect(session.authenticate).toHaveBeenCalled()
		})
		it('api: handles rate limiting (429) and logs appropriately', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const axiosMock = vi.fn().mockImplementation(() => {
				const err: any = new Error('429')
				err.response = { status: 429 }
				throw err
			});
			(session as any).axiosInstance = Object.assign(axiosMock, {
				defaults: { headers: { common: {} } },
				interceptors: {},
				getUri: vi.fn(),
				create: vi.fn(),
				request: axiosMock,
			})
			await expect(session.request({})).rejects.toBeInstanceOf(Error)
			expect(log.warn).not.toBeCalledWith('Session expired for host "host", retrying authentication...')
		})
	})

	describe('Site Map & Site Name', () => {
		it('should throw UnifiApiError on site loading with malformed data', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: null }))
			await expect(session['loadSites']()).rejects.toBeInstanceOf(UnifiApiError)
			await expect(session['loadSites']()).rejects.toMatchObject({
				message: expect.stringContaining('Unexpected site list structure'),
				cause: expect.anything(),
			})
		})
		it('should warn on unknown site', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(session.getSiteName('unknown')).toBeUndefined()
		})
		it('should return available site pairs', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).siteMap.set('desc', 'site1')
			;(session as any).siteMap.set('site1', 'site1')
			expect(session.getAvailableSitePairs()).toContain('desc (site1)')
		})
		it('getAvailableSitePairs returns empty array for empty map', () => {
			const session = new SessionManager('host', 'user', 'pass', log);
			(session as any).siteMap.clear()
			expect(session.getAvailableSitePairs()).toEqual([])
		})
		it('getAvailableSitePairs with multiple duplicate values and mixed keys', () => {
			const session = new SessionManager('host', 'user', 'pass', log);
			(session as any).siteMap.set('a', 'x');
			(session as any).siteMap.set('b', 'x');
			(session as any).siteMap.set('c', 'y');
			(session as any).siteMap.set('d', 'y');
			(session as any).siteMap.set('e', 'e')
			expect(session.getAvailableSitePairs()).toEqual(['a (x)', 'c (y)'])
		})
		it('should map sites with desc and name, only desc, only name, or neither', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const sites = [
				{ desc: 'desc1', name: 'site1' },
				{ desc: 'desc2' },
				{ name: 'site3' },
				{},
			]
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: sites }))
			await session['loadSites']()
			// Update site mapping logic: desc and name both map to name
			expect((session as any).siteMap.get('desc1')).toBe('site1')
			expect((session as any).siteMap.get('site1')).toBe('site1')
			expect((session as any).siteMap.get('desc2')).toBeUndefined()
			expect((session as any).siteMap.get('site3')).toBe('site3')
		})
		it('should log and rethrow UnifiApiError in loadSites', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const err = new UnifiApiError('fail')
			vi.spyOn(session, 'request').mockRejectedValue(err)
			await expect(session['loadSites']()).rejects.toBe(err)
			// Update error log assertions for new message format
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('API error [endpoint: /api/self/sites]: fail'))
		})
		it('should log and wrap non-UnifiApiError in loadSites', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			vi.spyOn(session, 'request').mockRejectedValue(new Error('fail'))
			await expect(session['loadSites']()).rejects.toBeInstanceOf(UnifiApiError)
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Error [endpoint: /api/self/sites]: fail'))
		})
		it('should warn on unknown site in getSiteName', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			session.getSiteName('unknown')
			expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Configured site "unknown" not recognized'))
		})
		it('should return available site pairs for various combinations', () => {
			const session = new SessionManager('host', 'user', 'pass', log);
			(session as any).siteMap.set('desc', 'site1');
			(session as any).siteMap.set('site1', 'site1');
			(session as any).siteMap.set('desc2', 'site2');
			(session as any).siteMap.set('site2', 'site2');
			(session as any).siteMap.set('desc3', 'site3')
			expect(session.getAvailableSitePairs()).toEqual(
				expect.arrayContaining(['desc (site1)', 'desc2 (site2)', 'desc3 (site3)'])
			)
		})
		it('getSiteName returns undefined for empty/undefined', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(session.getSiteName(undefined as any)).toBeUndefined()
			expect(session.getSiteName('')).toBeUndefined()
		})
		it('loadSites with empty array clears map', async () => {
			const session = new SessionManager('host', 'user', 'pass', log);
			(session as any).siteMap.set('desc', 'site1');
			(session as any).siteMap.set('site1', 'site1')
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: [] }))
			await session['loadSites']()
			expect((session as any).siteMap.size).toBe(0)
		})
		it('loadSites with desc=name only sets one entry', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const sites = [ { desc: 'site1', name: 'site1' } ]
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: sites }))
			await session['loadSites']()
			expect((session as any).siteMap.get('site1')).toBe('site1')
			expect((session as any).siteMap.get('desc')).toBeUndefined()
		})
		it('getSiteName logs for undefined/empty input with empty siteMap', () => {
			log.warn = vi.fn()
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(session.getSiteName(undefined as any)).toBeUndefined()
			expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Configured site "undefined" not recognized'))
			// Reset log.warn for next check
			log.warn = vi.fn()
			expect(session.getSiteName('')).toBeUndefined()
			expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Configured site "" not recognized'))
		})
		it('getAvailableSitePairs returns empty for only self-mapping entries', () => {
			const session = new SessionManager('host', 'user', 'pass', log);
			(session as any).siteMap.set('site1', 'site1');
			(session as any).siteMap.set('site2', 'site2')
			expect(session.getAvailableSitePairs()).toEqual([])
		})
		it('loadSites ignores site objects with no desc and no name', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const sites = [ { desc: 'desc1', name: 'site1' }, {}, { name: 'site2' } ]
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: sites }))
			await session['loadSites']()
			expect((session as any).siteMap.get('desc1')).toBe('site1')
			expect((session as any).siteMap.get('site2')).toBe('site2')
			expect(Array.from((session as any).siteMap.keys())).not.toContain(undefined)
		})
		it('getAvailableSitePairs deduplicates multiple keys to same value and all self-mapping', () => {
			const session = new SessionManager('host', 'user', 'pass', log);
			(session as any).siteMap.set('a', 'x');
			(session as any).siteMap.set('b', 'x');
			(session as any).siteMap.set('c', 'c');
			(session as any).siteMap.set('d', 'd')
			expect(session.getAvailableSitePairs()).toEqual(['a (x)']); // Only first key for value 'x'
			(session as any).siteMap.clear();
			(session as any).siteMap.set('e', 'e');
			(session as any).siteMap.set('f', 'f')
			expect(session.getAvailableSitePairs()).toEqual([])
		})
		it('loadSites logs loaded site keys', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const sites = [ { desc: 'desc1', name: 'site1' }, { name: 'site2' } ]
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: sites }))
			await session['loadSites']()
			expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Loaded sites'))
			expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('site1'))
			expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('site2'))
		})
	})

	describe('Utility Methods', () => {
		it('getApiHelper returns the apiHelper instance', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(session.getApiHelper()).toBeDefined()
		})

		it('getSiteName returns undefined and logs for unknown site', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const spy = vi.spyOn(log, 'warn')
			expect(session.getSiteName('notfound')).toBeUndefined()
			expect(spy).toHaveBeenCalledWith(expect.stringContaining('Configured site "notfound" not recognized'))
		})

		it('getSiteName returns correct mapping', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).siteMap.set('foo', 'bar')
			expect(session.getSiteName('foo')).toBe('bar')
		})

		it('getAvailableSitePairs returns expected pairs', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).siteMap.set('desc', 'site1')
			;(session as any).siteMap.set('site1', 'site1')
			;(session as any).siteMap.set('desc2', 'site2')
			;(session as any).siteMap.set('site2', 'site2')
			expect(session.getAvailableSitePairs()).toEqual(expect.arrayContaining(['desc (site1)', 'desc2 (site2)']))
		})

		it('getAvailableSitePairs returns empty for only self-mapping', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).siteMap.set('site1', 'site1')
			;(session as any).siteMap.set('site2', 'site2')
			expect(session.getAvailableSitePairs()).toEqual([])
		})
	})

	describe('loadSites edge cases', () => {
		it('ignores site objects with no desc and no name', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const sites = [ { desc: 'desc1', name: 'site1' }, {}, { name: 'site2' } ]
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: sites }))
			await session['loadSites']()
			expect((session as any).siteMap.get('desc1')).toBe('site1')
			expect((session as any).siteMap.get('site2')).toBe('site2')
		})

		it('clears siteMap for empty array', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			;(session as any).siteMap.set('desc', 'site1')
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: [] }))
			await session['loadSites']()
			expect((session as any).siteMap.size).toBe(0)
		})

		it('throws and logs for malformed data', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			vi.spyOn(session, 'request').mockResolvedValue(mockAxiosResponse({ data: null }))
			await expect(session['loadSites']()).rejects.toBeInstanceOf(UnifiApiError)
		})

		it('logs and rethrows UnifiApiError', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			const err = new UnifiApiError('fail')
			vi.spyOn(session, 'request').mockRejectedValue(err)
			await expect(session['loadSites']()).rejects.toBe(err)
		})

		it('logs and wraps non-UnifiApiError', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			vi.spyOn(session, 'request').mockRejectedValue('fail')
			await expect(session['loadSites']()).rejects.toBeInstanceOf(UnifiApiError)
		})
	})

	describe('authenticate edge cases', () => {
		it('throws UnifiAuthError if Axios.create fails', async () => {
			const orig = (Axios as any).create
			;(Axios as any).create = () => { throw new Error('fail') }
			const session = new SessionManager('host', 'user', 'pass', log)
			await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
			;(Axios as any).create = orig
		})

		it('throws UnifiAuthError if detectApiType fails', async () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			vi.spyOn(session.getApiHelper(), 'getApiType').mockReturnValue(null)
			vi.spyOn(session.getApiHelper(), 'detectApiType').mockRejectedValue(new Error('fail'))
			await expect(session.authenticate()).rejects.toBeInstanceOf(UnifiAuthError)
		})
	})

	describe('Utility Methods & Coverage', () => {
		it('calls all public methods for coverage', () => {
			const session = new SessionManager('host', 'user', 'pass', log)
			expect(typeof session.getApiHelper()).toBe('object')
			expect(session.getSiteName('nonexistent')).toBeUndefined()
			expect(Array.isArray(session.getAvailableSitePairs())).toBe(true)
		})
	})
})
