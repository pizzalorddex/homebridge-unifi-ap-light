import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import Axios, { AxiosError } from 'axios'
import { format } from 'node:util'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer, Server } from 'node:https'
import jwt from 'jsonwebtoken'
import { SessionManager } from '../../src/utils/sessionManager.js'
import { UnifiApiHelper, UnifiApiType } from '../../src/api/unifiApiHelper.js'
import { resetErrorState } from '../../src/utils/errorLogManager.js'

const log = { debug() {}, info() {}, warn() {}, error() {} }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); resetErrorState() })

it('never formats login credentials, cookies or tokens into detection errors', async () => {
	let output = ''
	const secret = 'synthetic-password-marker'
	const error = new AxiosError('Rejected', 'ERR_BAD_REQUEST', { data: JSON.stringify({ username: 'synthetic', password: secret }),
		headers: { Cookie: 'synthetic-cookie-marker', Authorization: 'synthetic-token-marker' } } as any)
	const helper = new UnifiApiHelper()
	await expect(helper.detectApiType({ post: async () => { throw error } } as any, 'synthetic', secret,
		{ ...log, error: (...args: unknown[]) => { output += format(...args) } } as any)).rejects.toThrow()
	expect(output).toContain('Login failed')
	for (const marker of [secret, 'synthetic-cookie-marker', 'synthetic-token-marker', 'config', 'headers']) {
		expect(output).not.toContain(marker)
	}
})

describe('Controller login throttling', () => {
	it.each([UnifiApiType.UnifiOS, UnifiApiType.SelfHosted])('retries the same endpoint once, including known controller types: %s', async type => {
		vi.useFakeTimers()
		const helper = new UnifiApiHelper()
		const post = vi.fn().mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '2' } } }).mockResolvedValue({ status: 200 })
		const pending = helper.login({ post } as any, type, 'synthetic', 'synthetic', log as any)
		await vi.advanceTimersByTimeAsync(1999)
		expect(post).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1)
		await expect(pending).resolves.toMatchObject({ status: 200 })
		expect(post.mock.calls.map(call => call[0])).toEqual(Array(2).fill(type === UnifiApiType.UnifiOS ? '/api/auth/login' : '/api/login'))
	})

	it('detects UniFi OS after a 429 without attempting legacy authentication or logging secrets', async () => {
		vi.useFakeTimers()
		let output = ''
		const post = vi.fn().mockRejectedValueOnce({ response: { status: 429 }, config: { password: 'synthetic-password-marker' } }).mockResolvedValue({ status: 200 })
		const helper = new UnifiApiHelper()
		const pending = helper.detectApiType({ post } as any, 'synthetic', 'synthetic', { ...log, warn: (message: string) => { output += message } } as any)
		await vi.advanceTimersByTimeAsync(5000)
		await expect(pending).resolves.toBe(UnifiApiType.UnifiOS)
		expect(post.mock.calls.map(call => call[0])).toEqual(['/api/auth/login', '/api/auth/login'])
		expect(output).toContain('HTTP 429')
		expect(output).not.toContain('synthetic-password-marker')
	})

	it('stops after the second 429, preserving its safe cause instead of trying legacy', async () => {
		vi.useFakeTimers()
		const post = vi.fn().mockRejectedValue({ response: { status: 429 } })
		const helper = new UnifiApiHelper()
		const pending = expect(helper.detectApiType({ post } as any, 'synthetic', 'synthetic', log as any)).rejects.toThrow('HTTP 429')
		await vi.advanceTimersByTimeAsync(5000)
		await pending
		expect(post).toHaveBeenCalledTimes(2)
		expect(helper.getApiType()).toBeNull()
	})

	it.each(['120', new Date(Date.now() + 120_000).toUTCString()])('defers long Retry-After values without retrying early: %s', async retryAfter => {
		const post = vi.fn().mockRejectedValue({ response: { status: 429, headers: { 'retry-after': retryAfter } } })
		await expect(new UnifiApiHelper().detectApiType({ post } as any, 'synthetic', 'synthetic', log as any)).rejects.toThrow('HTTP 429')
		expect(post).toHaveBeenCalledOnce()
	})

	it.each([{ response: { status: 502 } }, { code: 'ECONNREFUSED' }])('keeps unavailable-controller failures distinct from endpoint detection: %j', async error => {
		const post = vi.fn().mockRejectedValue(error)
		await expect(new UnifiApiHelper().detectApiType({ post } as any, 'synthetic', 'synthetic', log as any)).rejects.toThrow(error.response ? 'HTTP 502' : 'ECONNREFUSED')
		expect(post).toHaveBeenCalledOnce()
	})

	it('uses the retry for authentication after the controller type is known', async () => {
		vi.useFakeTimers()
		const session = new SessionManager('example.invalid', 'synthetic', 'synthetic', log as any)
		session.getApiHelper().setApiType(UnifiApiType.SelfHosted)
		const post = vi.fn().mockRejectedValueOnce({ response: { status: 429 } }).mockResolvedValue({ headers: { 'set-cookie': ['synthetic=synthetic'] } })
		vi.spyOn(Axios, 'create').mockReturnValue({ post, defaults: { headers: { common: {} } } } as any)
		vi.spyOn(session as any, 'loadSites').mockResolvedValue(undefined)
		const pending = session.authenticate()
		await vi.advanceTimersByTimeAsync(5000)
		await pending
		expect(post).toHaveBeenCalledTimes(2)
	})
})

describe('Inherited site LED state', () => {
	it.each([UnifiApiType.SelfHosted, UnifiApiType.UnifiOS])('uses the correct settings route and refreshes its bounded cache: %s', async type => {
		vi.useFakeTimers()
		const session = new SessionManager('example.invalid', 'synthetic', 'synthetic', log as any)
		session.getApiHelper().setApiType(type)
		const request = vi.spyOn(session, 'request').mockResolvedValue({ data: { meta: { rc: 'ok' }, data: [{ key: 'mgmt', led_enabled: true }] } } as any)
		expect(await session.getSiteLedEnabled('default')).toBe(true)
		expect(await session.getSiteLedEnabled('default')).toBe(true)
		expect(request).toHaveBeenCalledOnce()
		expect(request.mock.calls[0][0].url).toBe(type === UnifiApiType.UnifiOS ? '/proxy/network/api/s/default/get/setting' : '/api/s/default/get/setting')
		request.mockResolvedValue({ data: { meta: { rc: 'ok' }, data: [{ key: 'mgmt', led_enabled: false }] } } as any)
		await vi.advanceTimersByTimeAsync(30_001)
		expect(await session.getSiteLedEnabled('default')).toBe(false)
	})

	it.each([
		{ meta: { rc: 'error' }, data: [{ key: 'mgmt', led_enabled: true }] },
		{ meta: { rc: 'ok' }, data: [] },
		{ meta: { rc: 'ok' }, data: [{ key: 'mgmt', led_enabled: 'false' }] },
	])('rejects missing or invalid state instead of guessing: %j', async data => {
		const session = new SessionManager('example.invalid', 'synthetic', 'synthetic', log as any)
		vi.spyOn(session, 'request').mockResolvedValue({ data } as any)
		await expect(session.getSiteLedEnabled('default')).rejects.toThrow('unavailable')
	})
})

describe('HTTPS controller identity', () => {
	let server: Server
	let host: string
	let work: string
	let certificate: string

	beforeAll(async () => {
		work = mkdtempSync(join(tmpdir(), 'ap-light-tls-'))
		certificate = join(work, 'certificate.pem')
		const key = join(work, 'key.pem')
		execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
			'-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', key, '-out', certificate], { stdio: 'ignore' })
		server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, (req, res) => {
			res.setHeader('Content-Type', 'application/json')
			if (req.url === '/api/auth/login') {
				res.setHeader('Set-Cookie', `TOKEN=${jwt.sign({ csrfToken: 'synthetic-csrf' }, 'synthetic-key')}; Path=/; HttpOnly`)
				res.end('{}')
			} else {
				res.end(JSON.stringify({ meta: { rc: 'ok' }, data: [{ name: 'default', desc: 'Default' }] }))
			}
		})
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
		host = `localhost:${(server.address() as any).port}`
	})

	afterAll(async () => {
		server.closeAllConnections()
		await new Promise<void>(resolve => server.close(() => resolve()))
		rmSync(work, { recursive: true, force: true })
	})

	it('keeps existing self-signed installations working', async () => {
		const session = new SessionManager(host, 'synthetic', 'synthetic', log as any)
		await session.authenticate()
		expect(session.getSiteName('default')).toBe('default')
	})

	it('rejects an untrusted certificate when verification is enabled', async () => {
		await expect(new SessionManager(host, 'synthetic', 'synthetic', log as any, { verifySsl: true }).authenticate()).rejects.toThrow()
	})

	it('trusts the configured CA while verifying the hostname', async () => {
		const session = new SessionManager(host, 'synthetic', 'synthetic', log as any, { caFile: certificate })
		await session.authenticate()
		expect(session.getSiteName('default')).toBe('default')
	})

	it('rejects a trusted certificate for the wrong hostname', async () => {
		await expect(new SessionManager(host.replace('localhost', '127.0.0.1'), 'synthetic', 'synthetic', log as any,
			{ caFile: certificate }).authenticate()).rejects.toThrow()
	})
})
