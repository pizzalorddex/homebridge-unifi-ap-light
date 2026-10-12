import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as hap from 'hap-nodejs'
import { UnifiAPLight } from '../../src/platform.js'
import { errorStates } from '../../src/utils/errorLogManager.js'

const config = { platform: 'UnifiAPLight', name: 'Test', host: 'example.invalid', username: 'synthetic', password: 'synthetic' }
function create(value: unknown) {
	const api = { hap, on: vi.fn() }
	const log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(k => [k, vi.fn()]))
	new UnifiAPLight(log as any, { ...config, enableRgb: value } as any, api as any)
	return { api, log }
}

describe('RGB configuration', () => {
	beforeEach(() => {
		for (const key of Object.keys(errorStates)) {
			delete errorStates[key]
		}
	})
	it.each([undefined, false, true])('accepts the optional boolean setting %s', value => {
		const f = create(value)
		expect(f.api.on).toHaveBeenCalledTimes(2)
		expect(f.log.error).not.toHaveBeenCalled()
	})
	it.each(['true', 'false', 1, 0, null, []].map(value => ({ value })))('stays idle for malformed RGB configuration $value', ({ value }) => {
		const f = create(value)
		expect(f.api.on).not.toHaveBeenCalled()
		expect(f.log.error).toHaveBeenCalledWith(expect.stringContaining('enableRgb'))
	})
})
