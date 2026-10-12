import { describe, expect, it, vi } from 'vitest'
import { RecoveryManager } from '../../src/platform/recoveryManager.js'

// Full recovery behavior is exercised with real HomeKit services in reliability.spec.ts.
describe('RecoveryManager', () => {
	it('waits for the shared platform refresh to finish', async () => {
		let finish!: () => void
		const pending = new Promise<void>(resolve => { finish = resolve })
		const platform = { refreshDeviceCache: vi.fn(() => pending) }
		const recovery = new RecoveryManager(platform as any)
		let completed = false
		const result = recovery.forceImmediateCacheRefresh().then(() => { completed = true })
		await Promise.resolve()
		expect(completed).toBe(false)
		finish()
		await result
		expect(completed).toBe(true)
	})
})
