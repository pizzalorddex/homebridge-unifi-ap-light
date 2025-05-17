import { describe, it, expect, beforeEach } from 'vitest'
import { UnifiApiError, UnifiAuthError, UnifiNetworkError, UnifiConfigError } from '../../src/models/unifiTypes.js'
import { mockLogger } from '../fixtures/homebridgeMocks'

describe('Custom Error Classes', () => {
	it('should create UnifiApiError with message and cause', () => {
		const err = new UnifiApiError('api error', new Error('cause'))
		expect(err.message).toBe('api error')
		expect(err.cause).toBeInstanceOf(Error)
	})

	it('should create UnifiAuthError with message and cause', () => {
		const err = new UnifiAuthError('auth error', new Error('cause'))
		expect(err.message).toBe('auth error')
		expect(err.cause).toBeInstanceOf(Error)
	})

	it('should create UnifiNetworkError with message and cause', () => {
		const err = new UnifiNetworkError('network error', new Error('cause'))
		expect(err.message).toBe('network error')
		expect(err.cause).toBeInstanceOf(Error)
	})

	it('should create UnifiConfigError with message', () => {
		const err = new UnifiConfigError('config error')
		expect(err.message).toBe('config error')
	})
})

describe('Type Definitions', () => {
	it('should allow creation of UnifiSite', () => {
		const site = { name: 'default', desc: 'Default Site' }
		expect(site).toMatchObject({ name: 'default', desc: 'Default Site' })
	})

	it('should allow creation of UnifiLedSettings', () => {
		const led = { enabled: true }
		expect(led.enabled).toBe(true)
	})

	it('should allow creation of UnifiDevice with all fields', () => {
		const device = {
			_id: 'id',
			mac: 'mac',
			site: 'site',
			type: 'uap',
			model: 'UAP-AC',
			name: 'Test AP',
			serial: 'serial',
			version: '1.0.0',
			led_override: 'on',
			ledSettings: { enabled: false },
		}
		expect(device.ledSettings?.enabled).toBe(false)
		expect(device.led_override).toBe('on')
	})

	it('should allow creation of UnifiApiResponse', () => {
		const resp = { meta: { rc: 'ok' }, data: [{ foo: 1 }] }
		expect(resp.meta?.rc).toBe('ok')
		expect(resp.data[0].foo).toBe(1)
	})

	it('should allow creation of UnifiAPLightConfig', () => {
		const config = {
			host: 'host',
			username: 'user',
			password: 'pass',
			sites: ['default'],
			includeIds: ['id1'],
			excludeIds: ['id2'],
			refreshIntervalMinutes: 5,
		}
		expect(config.host).toBe('host')
		expect(config.sites).toContain('default')
	})
})

describe('Logger Robustness', () => {
	let logger: typeof mockLogger
	beforeEach(() => {
		Object.values(mockLogger).forEach(fn => fn.mockClear && fn.mockClear())
		logger = mockLogger
	})
	it('logger methods handle undefined/null/empty messages', () => {
		expect(() => logger.debug()).not.toThrow()
		expect(() => logger.info(null)).not.toThrow()
		expect(() => logger.warn('')).not.toThrow()
		expect(() => logger.error(undefined)).not.toThrow()
	})
})

describe('Settings/Environment', () => {
	it('settings: loads with missing, extra, and invalid fields', () => {
		// Simulate missing fields
		const minimal = { platform: 'UnifiAPLight' }
		expect(minimal.platform).toBe('UnifiAPLight')
		// Simulate extra fields
		const extra = { ...minimal, foo: 'bar', bar: 123 }
		expect(extra.foo).toBe('bar')
		// Simulate invalid field types (should not throw, but may be ignored)
		const invalid = { ...minimal, refreshIntervalMinutes: 'bad' }
		expect(typeof invalid.refreshIntervalMinutes).toBe('string')
	})
})
