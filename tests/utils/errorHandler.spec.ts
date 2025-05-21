import { errorLogManagerMock } from '../fixtures/errorLogManagerMock.js'
vi.mock('../../src/utils/errorLogManager', () => errorLogManagerMock)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markAccessoryNotResponding, markThisAccessoryNotResponding } from '../../src/utils/errorHandler'
import { mockPlatform, mockAccessory } from '../fixtures/homebridgeMocks'
import { errorHandler } from '../../src/utils/errorHandler'

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

		it('logs with summary and calls setOffline for UnifiNetworkError', async () => {
			const log = { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'error', summary: 'summary text' })
			const setOfflineSpy = vi.spyOn(mod, 'setOffline')
			errorHandler(log as any, { name: 'UnifiNetworkError', message: 'net fail' })
			expect(log.error).toHaveBeenCalledWith('[API] Network error: summary text')
			expect(setOfflineSpy).toHaveBeenCalled()
			spy.mockRestore()
			setOfflineSpy.mockRestore()
		})

		it('logs with summary and calls setOffline for UnifiAuthError', async () => {
			const log = { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'error', summary: 'summary text' })
			const setOfflineSpy = vi.spyOn(mod, 'setOffline')
			errorHandler(log as any, { name: 'UnifiAuthError', message: 'auth fail' })
			expect(log.error).toHaveBeenCalledWith('[API] Authentication error: summary text')
			expect(setOfflineSpy).toHaveBeenCalled()
			spy.mockRestore()
			setOfflineSpy.mockRestore()
		})

		it('logs at debug level if logLevel is debug', async () => {
			const log = { error: undefined, debug: vi.fn(), warn: undefined, info: undefined }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'debug' })
			errorHandler(log as any, { name: 'UnifiApiError', message: 'api fail' })
			expect(log.debug).toHaveBeenCalledWith('[API] API error: api fail')
			spy.mockRestore()
		})

		it('logs at warn level if logLevel is warn', async () => {
			const log = { error: undefined, debug: undefined, warn: vi.fn(), info: undefined }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'warn' })
			errorHandler(log as any, { name: 'UnifiApiError', message: 'api fail' })
			expect(log.warn).toHaveBeenCalledWith('[API] API error: api fail')
			spy.mockRestore()
		})

		it('calls setOffline for UnifiNetworkError with summary', async () => {
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const setOfflineSpy = vi.spyOn(mod, 'setOffline')
			const shouldLogErrorSpy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'error', summary: 'Suppressed summary' })
			errorHandler(log, { name: 'UnifiNetworkError', message: 'net fail' })
			expect(setOfflineSpy).toHaveBeenCalled()
			shouldLogErrorSpy.mockRestore()
			setOfflineSpy.mockRestore()
		})

		it('calls setOffline for UnifiAuthError with summary', async () => {
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const setOfflineSpy = vi.spyOn(mod, 'setOffline')
			const shouldLogErrorSpy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'error', summary: 'Suppressed summary' })
			errorHandler(log, { name: 'UnifiAuthError', message: 'auth fail' })
			expect(setOfflineSpy).toHaveBeenCalled()
			shouldLogErrorSpy.mockRestore()
			setOfflineSpy.mockRestore()
		})

		it('uses debug log level if errorLogManager returns debug', async () => {
			const log = { error: undefined, warn: undefined, debug: vi.fn(), info: undefined }
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'debug' })
			errorHandler(log as any, err)
			expect(log.debug).toHaveBeenCalledWith('[API] Network error: net fail')
			spy.mockRestore()
		})

		it('uses warn log level if errorLogManager returns warn', async () => {
			const log = { error: undefined, warn: vi.fn(), debug: undefined, info: undefined }
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'warn' })
			errorHandler(log as any, err)
			expect(log.warn).toHaveBeenCalledWith('[API] Network error: net fail')
			spy.mockRestore()
		})

		it('logs info-level RecoveryInfo with summary', async () => {
			const log = { error: undefined, warn: undefined, debug: undefined, info: vi.fn() }
			const { errorLogManagerMock } = await import('../fixtures/errorLogManagerMock.js')
			errorLogManagerMock.shouldLogError = () => ({ logLevel: 'info', summary: 'info summary' })
			const { errorHandler } = await import('../../src/utils/errorHandler.js')
			errorHandler(log as any, { name: 'RecoveryInfo', message: 'recovered' })
			expect(log.info).toHaveBeenCalledWith('[API] Info: recovered')
		})

		it('falls back to noop if no log methods are functions', async () => {
			const log = { error: undefined, warn: undefined, debug: undefined, info: undefined, success: undefined, log: undefined }
			const err = { name: 'UnifiNetworkError', message: 'net fail' }
			const mod = (await vi.importMock('../../src/utils/errorLogManager')) as any
			const spy = vi.spyOn(mod, 'shouldLogError').mockReturnValue({ logLevel: 'error' })
			errorHandler(log as any, err)
			// No error thrown, nothing called
			spy.mockRestore()
		})
	})
})
