import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markAccessoryNotResponding, markThisAccessoryNotResponding } from '../../src/utils/errorHandler'
import { mockPlatform, mockAccessory } from '../fixtures/homebridgeMocks'
import { errorHandler } from '../../src/utils/errorHandler' // Adjust the import based on your file structure

beforeEach(() => {
	mockPlatform.log.warn.mockClear()
})

describe('errorHandler', () => {
	describe('markAccessoryNotResponding', () => {
		it('updates characteristic if service exists', () => {
			const updateCharacteristic = vi.fn()
			const accessory = {
				...mockAccessory,
				getService: vi.fn(() => ({ updateCharacteristic })),
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(accessory.getService).toHaveBeenCalledWith(mockPlatform.Service.Lightbulb)
			expect(updateCharacteristic).toHaveBeenCalledWith('On', expect.any(Error))
			expect(mockPlatform.log.warn).not.toHaveBeenCalled()
		})

		it('should log a warning if service does not exist and context has accessPoint', () => {
			const accessory = {
				...mockAccessory,
				getService: vi.fn(() => undefined),
				context: { accessPoint: { name: 'AP', _id: 'id', site: 'site' } },
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for AP (id)')
		})

		it('logs a warning with fallback values if service does not exist and context/accessPoint is missing', () => {
			const accessory = {
				getService: vi.fn(() => undefined),
				displayName: 'TestName',
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for TestName (unknown)')
		})
	})

	describe('markThisAccessoryNotResponding', () => {
		it('updates characteristic if service exists', () => {
			const updateCharacteristic = vi.fn()
			const instance = {
				service: { updateCharacteristic },
				platform: mockPlatform,
				accessPoint: { name: 'AP', _id: 'id', site: 'site' },
			}
			markThisAccessoryNotResponding(instance as any)
			expect(updateCharacteristic).toHaveBeenCalledWith('On', expect.any(Error))
			expect(instance.platform.log.warn).not.toHaveBeenCalled()
		})

		it('logs a warning if service does not exist', () => {
			const log = { warn: vi.fn() }
			const instance = {
				service: undefined,
				platform: { ...mockPlatform, log },
				accessPoint: { name: 'AP', _id: 'id' },
			}
			markThisAccessoryNotResponding(instance as any)
			expect(log.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for AP (id)')
		})
	})

	describe('errorHandler (main function)', () => {
		let log: any
		beforeEach(() => {
			log = {
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
				info: vi.fn(),
			}
		})

		it('logs UnifiApiError with context', () => {
			const err = { name: 'UnifiApiError', message: 'api fail' }
			errorHandler(log, err, { site: 'site1', endpoint: '/api' })
			expect(log.error).toHaveBeenCalledWith('[API] API error [site: site1, endpoint: /api]: api fail')
		})

		it('logs UnifiAuthError', () => {
			errorHandler(log, { name: 'UnifiAuthError', message: 'auth fail' })
			expect(log.error).toHaveBeenCalledWith('[API] Authentication error: auth fail')
		})

		it('logs UnifiNetworkError', () => {
			errorHandler(log, { name: 'UnifiNetworkError', message: 'net fail' })
			expect(log.error).toHaveBeenCalledWith('[API] Network error: net fail')
		})

		it('logs UnifiConfigError', () => {
			errorHandler(log, { name: 'UnifiConfigError', message: 'config fail' })
			expect(log.error).toHaveBeenCalledWith('[API] Config error: config fail')
		})

		it('logs Error instance with context', () => {
			errorHandler(log, new Error('err msg'), { site: 'site2' })
			expect(log.error).toHaveBeenCalledWith('[API] Error [site: site2]: err msg')
		})

		it('logs object with message property', () => {
			errorHandler(log, { message: 'msg from obj' })
			expect(log.error).toHaveBeenCalledWith('[API] Error: msg from obj')
		})

		it('logs plain object', () => {
			errorHandler(log, { foo: 1 })
			expect(log.error).toHaveBeenCalledWith('[API] Error: [object Object]')
		})

		it('logs string error', () => {
			errorHandler(log, 'string error')
			expect(log.error).toHaveBeenCalledWith('[API] Error: string error')
		})

		it('logs null error', () => {
			errorHandler(log, null)
			expect(log.error).toHaveBeenCalledWith('[API] Error: null')
		})

		it('logs undefined error', () => {
			errorHandler(log, undefined)
			expect(log.error).toHaveBeenCalledWith('[API] Error: undefined')
		})

		it('logs error with empty message', () => {
			errorHandler(log, { name: 'UnifiApiError', message: '' })
			expect(log.error).toHaveBeenCalledWith('[API] API error: ')
		})

		it('logs unknown error type', () => {
			const log = { error: vi.fn() }
			errorHandler(log as any, Symbol('other'))
			expect(log.error).toHaveBeenCalledWith('[API] Error: Symbol(other)')
		})
	})

	describe('errorHandler log suppression and offline mode', () => {
		let log: any
		let resetErrorState: () => void
		beforeEach(async () => {
			log = {
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
				info: vi.fn(),
			}
			// Defensive: ensure all log methods are functions
			for (const method of ['error', 'warn', 'debug', 'info']) {
				if (typeof log[method] !== 'function') {
					log[method] = vi.fn()
				}
			}
			// Use ESM import for resetErrorState
			({ resetErrorState } = await import('../../src/utils/errorLogManager'))
			resetErrorState()
		})

		it('suppresses repeated errors and logs summary at threshold', () => {
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			errorHandler(log, err)
			for (let i = 0; i < 3; i++) {
				errorHandler(log, err)
			}
			// Only the first should be error, others suppressed
			expect(log.error).toHaveBeenCalledTimes(1)
			// Simulate up to threshold
			for (let i = 3; i < 7; i++) {
				errorHandler(log, err)
			}
			// At threshold+1, should log summary
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Suppressed'))
		})

		it('downgrades to debug in offline mode after suppression/summary', () => {
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			// 1st call: error
			errorHandler(log, err)
			// 2nd-6th: suppressed
			for (let i = 0; i < 5; i++) {
				errorHandler(log, err)
			}
			// 7th: summary (error)
			errorHandler(log, err)
			// 8th+: should be debug (offline)
			errorHandler(log, err)
			// Check: 1st error, 7th summary, 8th debug
			expect(log.error).toHaveBeenCalledWith('[API] Network error: net fail')
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Suppressed'))
			expect(log.debug).toHaveBeenCalledWith('[API] Network error: net fail')
		})

		it('resets suppression and offline state on new error message', () => {
			const err1 = { name: 'UnifiNetworkError', message: 'net fail' }
			const err2 = { name: 'UnifiNetworkError', message: 'net fail 2' }
			errorHandler(log, err1)
			for (let i = 0; i < 3; i++) {
				errorHandler(log, err1)
			}
			errorHandler(log, err2)
			// Should log error for new message
			expect(log.error).toHaveBeenCalledWith('[API] Network error: net fail 2')
		})

		it('resets offline state on recovery', async () => {
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			errorHandler(log, err)
			for (let i = 0; i < 3; i++) {
				errorHandler(log, err)
			}
			resetErrorState()
			errorHandler(log, err)
			// After reset, should log error again
			expect(log.error).toHaveBeenCalledWith('[API] Network error: net fail')
		})

		it('uses warn log level if errorLogManager returns warn', async () => {
			const log = { error: undefined, warn: vi.fn(), debug: undefined, info: undefined, success: vi.fn(), log: vi.fn() }
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			const mod = await import('../../src/utils/errorLogManager')
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'warn' })
			errorHandler(log as any, err)
			expect(log.warn).toHaveBeenCalledWith('[API] Network error: net fail')
			spy.mockRestore()
		})

		it('falls back to noop if no log methods are functions', async () => {
			const log = { error: undefined, warn: undefined, debug: undefined, info: undefined, success: undefined, log: undefined }
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			const mod = await import('../../src/utils/errorLogManager')
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'error' })
			errorHandler(log as any, err)
			// No error thrown, nothing called
			spy.mockRestore()
		})

		it('logs summary for UnifiConfigError', () => {
			const log = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn(), success: vi.fn(), log: vi.fn() }
			const err = { name: 'UnifiConfigError', message: 'config fail' }
			for (let i = 0; i < 6; i++) {
				errorHandler(log as any, err)
			}
			errorHandler(log as any, err) // 7th call triggers summary
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Suppressed'))
		})

		it('logs summary for generic Error', () => {
			const log = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn(), success: vi.fn(), log: vi.fn() }
			const err = new Error('generic fail')
			for (let i = 0; i < 6; i++) {
				errorHandler(log as any, err)
			}
			errorHandler(log as any, err)
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Suppressed'))
		})

		it('logs summary for object with no message', () => {
			const log = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn(), success: vi.fn(), log: vi.fn() }
			const err = { foo: 123 }
			for (let i = 0; i < 6; i++) {
				errorHandler(log as any, err)
			}
			errorHandler(log as any, err)
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Suppressed'))
		})

		it('logs summary for non-object error', () => {
			const log = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn(), success: vi.fn(), log: vi.fn() }
			const err = 42
			for (let i = 0; i < 6; i++) {
				errorHandler(log as any, err)
			}
			errorHandler(log as any, err)
			expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Suppressed'))
		})
	})
})
