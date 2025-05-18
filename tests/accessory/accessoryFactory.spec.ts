import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAndRegisterAccessory, restoreAccessory, removeAccessory } from '../../src/accessory/accessoryFactory.js'
import { markAccessoryNotResponding } from '../../src/utils/errorHandler.js'
import { mockService, mockAccessory, mockPlatform } from '../fixtures/homebridgeMocks'

describe('accessoryFactory', () => {
	beforeEach(() => {
		Object.values(mockService).forEach(fn => fn.mockClear && fn.mockClear())
		if (typeof mockAccessory.getService === 'function' && 'mockClear' in mockAccessory.getService) {
			mockAccessory.getService.mockClear()
		}
		if (typeof mockAccessory.addService === 'function' && 'mockClear' in mockAccessory.addService) {
			mockAccessory.addService.mockClear()
		}
		Object.values(mockPlatform.log).forEach(fn => fn.mockClear && fn.mockClear())
	})

	it('should export createAndRegisterAccessory as a function', () => {
		expect(typeof createAndRegisterAccessory).toBe('function')
	})

	describe('createAndRegisterAccessory', () => {
		it('should handle error in registerPlatformAccessories', () => {
			const platformMock = {
				api: {
					platformAccessory: vi.fn((name, uuid) => ({ name, uuid, context: {}, getService: vi.fn(() => ({ setCharacteristic: vi.fn().mockReturnThis(), getCharacteristic: vi.fn().mockReturnThis(), onSet: vi.fn().mockReturnThis(), onGet: vi.fn().mockReturnThis(), updateCharacteristic: vi.fn() })) })),
					registerPlatformAccessories: vi.fn(() => { throw new Error('register error') }),
				},
				accessories: [],
				log: { info: vi.fn(), error: vi.fn() },
				Service: { Lightbulb: {}, AccessoryInformation: {} },
				Characteristic: { On: 'On', Name: 'Name', Manufacturer: 'Manufacturer', Model: 'Model', SerialNumber: 'SerialNumber', FirmwareRevision: 'FirmwareRevision' },
				getDeviceCache: () => ({ getDeviceById: vi.fn(() => ({ _id: 'id', name: 'AP', site: 'default', model: 'UAP', serial: 'SN', version: '1.0.0' })) }),
				config: { sites: ['default'] },
				sessionManager: { getSiteName: vi.fn(() => 'default'), getApiHelper: vi.fn(() => ({ getDeviceUpdateEndpoint: vi.fn() })) },
			}
			const accessPoint = { name: 'AP', _id: 'id', site: 'default', model: 'UAP', serial: 'SN', version: '1.0.0' }
			const uuid = 'uuid-1'
			createAndRegisterAccessory(platformMock as any, accessPoint as any, uuid)
			expect(platformMock.log.error).toHaveBeenCalledWith(expect.stringContaining('Error during registerPlatformAccessories'))
		})
	})

	describe('restoreAccessory', () => {
		it('should call UniFiAP constructor and log info', () => {
			const platformMock = {
				log: { info: vi.fn() },
				Service: { Lightbulb: {}, AccessoryInformation: {} },
				Characteristic: { On: 'On', Name: 'Name', Manufacturer: 'Manufacturer', Model: 'Model', SerialNumber: 'SerialNumber', FirmwareRevision: 'FirmwareRevision' },
				getDeviceCache: vi.fn(() => ({ getDeviceById: vi.fn(() => ({ _id: 'id', name: 'AP', site: 'default' })) })),
				config: { sites: ['default'] },
				sessionManager: { getSiteName: vi.fn(() => 'default'), getApiHelper: vi.fn(() => ({ getDeviceUpdateEndpoint: vi.fn() })) },
			}
			const accessPoint = { _id: 'id', name: 'AP', site: 'default', model: 'UAP', serial: 'SN', version: '1.0.0' }
			const existingAccessory = { displayName: 'AP', context: { accessPoint }, getService: vi.fn(() => ({ setCharacteristic: vi.fn().mockReturnThis(), getCharacteristic: vi.fn().mockReturnThis(), onSet: vi.fn().mockReturnThis(), onGet: vi.fn().mockReturnThis(), updateCharacteristic: vi.fn() })) }
			// Just ensure it does not throw and logs info
			expect(() => restoreAccessory(platformMock as any, accessPoint as any, existingAccessory as any)).not.toThrow()
			expect(platformMock.log.info).toHaveBeenCalledWith(expect.stringContaining('Restoring existing accessory from cache'))
		})
	})

	describe('removeAccessory', () => {
		it('should handle error in unregisterPlatformAccessories', () => {
			const platformMock = {
				api: {
					unregisterPlatformAccessories: vi.fn(() => { throw new Error('unregister error') }),
				},
				accessories: [{ UUID: 'uuid-1' }],
				log: { info: vi.fn(), error: vi.fn() },
				Service: { Lightbulb: {} },
				Characteristic: { On: 'On' },
			}
			const accessory = { UUID: 'uuid-1', displayName: 'AP', context: { accessPoint: { _id: 'id', name: 'AP', site: 'default' } } }
			removeAccessory(platformMock as any, accessory as any)
			expect(platformMock.log.error).toHaveBeenCalledWith(expect.stringContaining('Error during unregisterPlatformAccessories'))
		})
	})

	describe('markAccessoryNotResponding', () => {
		it('should mark accessory as Not Responding', () => {
			markAccessoryNotResponding(mockPlatform as any, mockAccessory as any)
			expect(mockService.updateCharacteristic).toHaveBeenCalledWith('On', new Error('Not Responding'))
		})
		it('should do nothing if Lightbulb service is missing', () => {
			const accessoryNoService = { ...mockAccessory, getService: vi.fn(() => undefined) }
			const platformWithLog = { ...mockPlatform, log: { warn: vi.fn() } }
			expect(() => markAccessoryNotResponding(platformWithLog as any, accessoryNoService as any)).not.toThrow()
		})
	})
})
