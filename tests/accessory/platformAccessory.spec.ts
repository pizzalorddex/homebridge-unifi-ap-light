import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UniFiAP } from '../../src/accessory/platformAccessory.js'
import { UnifiAPLight } from '../../src/platform.js'
import { PlatformAccessory } from 'homebridge'
import { markAccessoryNotResponding } from '../../src/utils/errorHandler.js'
import { resetErrorState } from '../../src/utils/errorLogManager.js'
import { mockService, mockAccessory, sharedMockCache, mockPlatform } from '../fixtures/homebridgeMocks'

describe('UniFiAP Accessory', () => {
	let accessory: UniFiAP

	beforeEach(() => {
		resetErrorState()
		vi.clearAllMocks()
		sharedMockCache.getDeviceById.mockReturnValue(mockAccessory.context.accessPoint)
		sharedMockCache.getAllDevices.mockReturnValue([mockAccessory.context.accessPoint])
		sharedMockCache.setDevices.mockClear()
		accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory)
	})

	describe('Initialization & Service Patching', () => {
		it('should initialize and patch missing site', () => {
			expect(accessory.accessPoint).toBeDefined()
			expect(mockAccessory.getService).toHaveBeenCalled()
			expect(mockService.setCharacteristic).toHaveBeenCalled()
		})

		it('should patch missing site and log a warning', () => {
			const logSpy = { ...mockPlatform.log, warn: vi.fn() }
			const noSiteDevice = { ...mockAccessory.context.accessPoint, site: undefined }
			const noSiteAccessory = {
				...mockAccessory,
				context: { accessPoint: { ...noSiteDevice } },
			}
			const singleSiteConfig = {
				...mockPlatform,
				config: { sites: ['mysite'] },
				sessionManager: { ...mockPlatform.sessionManager, getSiteName: vi.fn(() => 'mysite-internal') },
				log: logSpy,
				getDeviceCache: () => ({
					getDeviceById: vi.fn(() => noSiteDevice),
					getAllDevices: vi.fn(() => [noSiteDevice]),
					setDevices: vi.fn(),
				}),
			}
			new UniFiAP(singleSiteConfig as any as UnifiAPLight, noSiteAccessory as any as PlatformAccessory)
			expect(logSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Patching missing site'))
		})

		it('should patch missing site and fallback to "default" if no site is resolved or configured', () => {
			const logSpy = { ...mockPlatform.log, warn: vi.fn() }
			const noSiteDevice = { ...mockAccessory.context.accessPoint, site: undefined }
			const noSiteAccessory = {
				...mockAccessory,
				context: { accessPoint: { ...noSiteDevice } },
			}
			const singleSiteConfig = {
				...mockPlatform,
				config: { sites: [''] }, // falsy site
				sessionManager: { ...mockPlatform.sessionManager, getSiteName: vi.fn(() => undefined) },
				log: logSpy,
				getDeviceCache: () => ({
					getDeviceById: vi.fn(() => noSiteDevice),
					getAllDevices: vi.fn(() => [noSiteDevice]),
					setDevices: vi.fn(),
				}),
			}
			const instance = new UniFiAP(singleSiteConfig as any as UnifiAPLight, noSiteAccessory as any as PlatformAccessory)
			expect(instance.accessPoint.site).toBe('default')
			expect(logSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Patching missing site'))
		})

		it('should use context accessPoint if device not found in cache (constructor)', () => {
			const contextDevice = { ...mockAccessory.context.accessPoint, name: 'Context AP', _id: 'context1' }
			const contextAccessory = { ...mockAccessory, context: { accessPoint: contextDevice } }
			const instance = new UniFiAP({
				...mockPlatform,
				getDeviceCache: () => ({
					getDeviceById: vi.fn(() => undefined),
					getAllDevices: vi.fn(() => []),
					setDevices: vi.fn(),
				}),
			} as any as UnifiAPLight, contextAccessory as any as PlatformAccessory)
			expect(instance.accessPoint).toBe(contextDevice)
		})
	})

	describe('AccessoryInformation & Lightbulb Service', () => {
		it('should log a warning if AccessoryInformation service is missing', () => {
			const contextAccessory = { ...mockAccessory, getService: vi.fn(() => undefined) }
			const logSpy = { ...mockPlatform.log, warn: vi.fn() }
			const platformWithLog = { ...mockPlatform, log: logSpy, getDeviceCache: vi.fn(() => ({ getDeviceById: vi.fn(() => undefined) })) }
			new UniFiAP(platformWithLog as any as UnifiAPLight, contextAccessory as any as PlatformAccessory)
			expect(logSpy.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for Test AP (ap1)')
		})

		it('should set all AccessoryInformation characteristics when service is present', () => {
			const infoService = {
				setCharacteristic: vi.fn().mockReturnThis(),
			}
			const accessoryWithInfo = {
				...mockAccessory,
				getService: vi.fn((svc) => svc === mockPlatform.Service.AccessoryInformation ? infoService : mockService),
			}
			new UniFiAP(mockPlatform as any as UnifiAPLight, accessoryWithInfo as any as PlatformAccessory)
			expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.Manufacturer, 'Ubiquiti')
			expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.Model, mockAccessory.context.accessPoint.model)
			expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.SerialNumber, mockAccessory.context.accessPoint.serial)
			expect(infoService.setCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.FirmwareRevision, mockAccessory.context.accessPoint.version)
		})

		it('should add Lightbulb service if not found', () => {
			const lightbulbMissing = { ...mockAccessory, getService: vi.fn(() => undefined), addService: vi.fn(() => mockService) }
			new UniFiAP(mockPlatform as any as UnifiAPLight, lightbulbMissing as any as PlatformAccessory)
			expect(lightbulbMissing.addService).toHaveBeenCalled()
		})

		it('should not add Lightbulb service if already present', () => {
			const getServiceSpy = vi.fn(() => mockService)
			const addServiceSpy = vi.fn(() => mockService)
			const accessoryWithLightbulb = { ...mockAccessory, getService: getServiceSpy, addService: addServiceSpy }
			new UniFiAP(mockPlatform as any as UnifiAPLight, accessoryWithLightbulb as any as PlatformAccessory)
			expect(getServiceSpy).toHaveBeenCalledWith(mockPlatform.Service.Lightbulb)
			expect(addServiceSpy).not.toHaveBeenCalled()
		})
	})

	describe('setOn Behavior', () => {
		it('should handle setOn and update cache', async () => {
			await accessory.setOn(true)
			expect(mockPlatform.sessionManager.request).toHaveBeenCalled()
			expect(mockPlatform.getDeviceCache().setDevices).toHaveBeenCalled()
		})

		it('setOn: should log error and not update cache on non-200 response', async () => {
			mockPlatform.sessionManager.request.mockResolvedValueOnce({ status: 500 })
			await accessory.setOn(true)
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[Accessory] Failed to set LED state for Test AP (ap1): Unexpected response status 500')
			expect(sharedMockCache.setDevices).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ led_override: 'on' })]))
		})

		it('setOn: should handle UnifiAuthError and set Not Responding', async () => {
			const error = new (class extends Error { })()
			Object.setPrototypeOf(error, { constructor: { name: 'UnifiAuthError' } })
			mockPlatform.sessionManager.request.mockRejectedValueOnce(error)
			await accessory.setOn(true)
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: setOn for Test AP (ap1)]: [object Error]')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('setOn: should handle generic error and set Not Responding', async () => {
			mockPlatform.sessionManager.request.mockRejectedValueOnce({ message: 'fail' })
			await accessory.setOn(true)
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: setOn for Test AP (ap1)]: fail')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('setOn: should update ledSettings for udm', async () => {
			const udm = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: false } }
			sharedMockCache.getDeviceById.mockReturnValue(udm)
			accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory)
			await accessory.setOn(true)
			expect(udm.ledSettings.enabled).toBe(true)
		})

		it('setOn: should update led_override for uap', async () => {
			const uap = { ...mockAccessory.context.accessPoint, type: 'uap', led_override: 'off' }
			sharedMockCache.getDeviceById.mockReturnValue(uap)
			accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory)
			await accessory.setOn(true)
			expect(uap.led_override).toBe('on')
		})

		it('setOn: should handle UnifiApiError and set Not Responding', async () => {
			class UnifiApiError extends Error { constructor(msg: string) { super(msg) } }
			mockPlatform.sessionManager.request.mockRejectedValueOnce(new UnifiApiError('api error'))
			await accessory.setOn(true)
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: setOn for Test AP (ap1)]: api error')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('setOn: should handle UnifiNetworkError and set Not Responding', async () => {
			class UnifiNetworkError extends Error { constructor(msg: string) { super(msg) } }
			mockPlatform.sessionManager.request.mockRejectedValueOnce(new UnifiNetworkError('network error'))
			await accessory.setOn(true)
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: setOn for Test AP (ap1)]: network error')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('setOn: should not throw if udm has no ledSettings', async () => {
			const udm = { ...mockAccessory.context.accessPoint, type: 'udm' }
			sharedMockCache.getDeviceById.mockReturnValue(udm)
			accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory)
			await expect(accessory.setOn(true)).resolves.not.toThrow()
		})

		it('setOn: should clear device cache on network/API error', async () => {
			// Simulate a UnifiNetworkError
			class UnifiNetworkError extends Error { constructor(msg: string) { super(msg) } }
			mockPlatform.sessionManager.request.mockRejectedValueOnce(new UnifiNetworkError('network error'))
			await accessory.setOn(true)
			expect(mockPlatform.getDeviceCache().clear).toHaveBeenCalled()
		})
	})

	describe('getOn Behavior', () => {
		it('should handle getOn for uap', async () => {
			const result = await accessory.getOn()
			expect(result).toBe(true)
		})

		it('should handle getOn for udm', async () => {
			const udm = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: true } }
			sharedMockCache.getDeviceById.mockReturnValue(udm)
			sharedMockCache.getAllDevices.mockReturnValue([udm])
			accessory = new UniFiAP(mockPlatform as any as UnifiAPLight, mockAccessory as any as PlatformAccessory)
			const result = await accessory.getOn()
			expect(result).toBe(true)
		})

		it('getOn: should log error and set Not Responding if device not in cache', async () => {
			sharedMockCache.getDeviceById.mockImplementation(() => { return undefined as any })
			await expect(accessory.getOn()).rejects.toThrow('Not Responding')
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: getOn]: Device not found in cache')
			// Accept either one or two calls, but check the first call is the expected error
			const calls = mockPlatform.log.error.mock.calls
			expect(calls[0][0]).toBe('[API] Error [site: default, endpoint: getOn]: Device not found in cache')
		})

		it('getOn: should log error and set Not Responding if ledSettings.enabled is undefined', async () => {
			const udm = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: {} }
			sharedMockCache.getDeviceById.mockReturnValue(udm)
			resetErrorState() // ensure suppression state is clear
			await expect(accessory.getOn()).rejects.toThrow('Not Responding')
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: getOn]: \'enabled\' property in \'ledSettings\' is undefined')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('getOn: should handle UnifiAuthError and set Not Responding', async () => {
			class UnifiAuthError extends Error { constructor(msg: string) { super(msg) } }
			sharedMockCache.getDeviceById.mockImplementation(() => { throw new UnifiAuthError('auth error') })
			await expect(accessory.getOn()).rejects.toThrow('Not Responding')
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: getOn for Test AP (ap1)]: auth error')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('getOn: should handle UnifiApiError and set Not Responding', async () => {
			class UnifiApiError extends Error { constructor(msg: string) { super(msg) } }
			sharedMockCache.getDeviceById.mockImplementation(() => { throw new UnifiApiError('api error') })
			await expect(accessory.getOn()).rejects.toThrow('Not Responding')
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: getOn for Test AP (ap1)]: api error')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('getOn: should handle UnifiNetworkError and set Not Responding', async () => {
			class UnifiNetworkError extends Error { constructor(msg: string) { super(msg) } }
			sharedMockCache.getDeviceById.mockImplementation(() => { throw new UnifiNetworkError('network error') })
			await expect(accessory.getOn()).rejects.toThrow('Not Responding')
			expect(mockPlatform.log.error).toHaveBeenCalledWith('[API] Error [site: default, endpoint: getOn for Test AP (ap1)]: network error')
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('getOn: should return correct value for udm with ledSettings.enabled true/false', async () => {
			const udmOn = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: true } }
			sharedMockCache.getDeviceById.mockReturnValue(udmOn)
			let result = await accessory.getOn()
			expect(result).toBe(true)
			const udmOff = { ...mockAccessory.context.accessPoint, type: 'udm', ledSettings: { enabled: false } }
			sharedMockCache.getDeviceById.mockReturnValue(udmOff)
			result = await accessory.getOn()
			expect(result).toBe(false)
		})

		it('getOn: should return correct value for uap with led_override on/off', async () => {
			const uapOn = { ...mockAccessory.context.accessPoint, type: 'uap', led_override: 'on' }
			sharedMockCache.getDeviceById.mockReturnValue(uapOn)
			let result = await accessory.getOn()
			expect(result).toBe(true)
			const uapOff = { ...mockAccessory.context.accessPoint, type: 'uap', led_override: 'off' }
			sharedMockCache.getDeviceById.mockReturnValue(uapOff)
			result = await accessory.getOn()
			expect(result).toBe(false)
		})
	})

	describe('markNotResponding & markNotRespondingForAccessory', () => {
		it('markNotResponding: should updateCharacteristic with Not Responding error', () => {
			markAccessoryNotResponding(mockPlatform as any, mockAccessory as any)
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
				mockPlatform.Characteristic.On,
				new Error('Not Responding')
			)
		})

		it('markNotResponding: should not throw if service is missing', () => {
			const noServiceAccessory = { ...mockAccessory, getService: vi.fn(() => undefined) }
			expect(() => markAccessoryNotResponding(mockPlatform as any, noServiceAccessory as any)).not.toThrow()
		})

		it('should set Not Responding on the On characteristic if service exists', () => {
			const service = {
				updateCharacteristic: vi.fn(),
				setCharacteristic: vi.fn(),
			}
			const accessoryWithService = { ...mockAccessory, getService: vi.fn((svc) => svc === mockPlatform.Service.Lightbulb ? service : undefined) }
			markAccessoryNotResponding(mockPlatform as any, accessoryWithService as any)
			expect(service.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('should log a warning if AccessoryInformation service is missing in markNotResponding', () => {
			const accessoryNoService = { ...mockAccessory, getService: vi.fn(() => undefined) }
			const logSpy = { ...mockPlatform.log, warn: vi.fn() }
			const platformWithLog = { ...mockPlatform, log: logSpy }
			markAccessoryNotResponding(platformWithLog as any, accessoryNoService as any)
			expect(logSpy.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for Test AP (ap1)')
		})

		it('markNotRespondingForAccessory: should set Not Responding if service exists', () => {
			const service = {
				updateCharacteristic: vi.fn(),
				setCharacteristic: vi.fn(),
			}
			const accessoryWithService = { ...mockAccessory, getService: vi.fn((svc) => svc === mockPlatform.Service.Lightbulb ? service : undefined) }
			markAccessoryNotResponding(mockPlatform as any, accessoryWithService as any)
			expect(service.updateCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic.On, new Error('Not Responding'))
		})

		it('markNotRespondingForAccessory: should log a warning if service is missing', () => {
			const accessoryNoService = {
				...mockAccessory,
				getService: vi.fn(() => undefined),
				displayName: 'NoServiceAP',
				context: { accessPoint: { ...mockAccessory.context.accessPoint, _id: 'ap2', name: 'NoServiceAP', site: 'default' } },
			}
			const logSpy = { ...mockPlatform.log, warn: vi.fn() }
			const platformWithLog = { ...mockPlatform, log: logSpy, Service: mockPlatform.Service, Characteristic: mockPlatform.Characteristic }
			markAccessoryNotResponding(platformWithLog as any, accessoryNoService as any)
			expect(logSpy.warn).toHaveBeenCalledWith('[Accessory] Accessory Information Service not found for NoServiceAP (ap2)')
		})
	})
})
