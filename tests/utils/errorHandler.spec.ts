import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markAccessoryNotResponding, markThisAccessoryNotResponding } from '../../src/utils/errorHandler'
import { mockPlatform } from '../fixtures/homebridgeMocks'
import { errorHandler } from '../../src/utils/errorHandler' // Adjust the import based on your file structure

beforeEach(() => {
	mockPlatform.log.warn.mockClear()
})

describe('errorHandler', () => {
	describe('markAccessoryNotResponding', () => {
		it('updates characteristic if service exists', () => {
			const updateCharacteristic = vi.fn()
			const accessory = {
				getService: vi.fn(() => ({ updateCharacteristic })),
				context: {},
				displayName: 'Test',
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(accessory.getService).toHaveBeenCalledWith(mockPlatform.Service.Lightbulb)
			expect(updateCharacteristic).toHaveBeenCalledWith('On', expect.any(Error))
			expect(mockPlatform.log.warn).not.toHaveBeenCalled()
		})

		it('should log a warning if service does not exist and context has accessPoint', () => {
			const accessory = {
				getService: vi.fn(() => undefined),
				context: { accessPoint: { name: 'AP', _id: 'id', site: 'site' } },
				displayName: 'Test',
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for AP (id)')
		})

		it('logs a warning with fallback values if service does not exist and context/accessPoint is missing', () => {
			const accessory = {
				getService: vi.fn(() => undefined),
				context: {},
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
			log = { error: vi.fn() }
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
})
