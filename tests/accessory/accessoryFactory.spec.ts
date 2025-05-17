import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAndRegisterAccessory, restoreAccessory, removeAccessory, markAccessoryNotResponding } from '../../src/accessoryFactory'

let updateCharacteristic: ReturnType<typeof vi.fn>
let service: any
let accessory: any
let platform: any

describe('accessoryFactory', () => {
	beforeEach(() => {
		updateCharacteristic = vi.fn()
		service = { updateCharacteristic }
		accessory = { getService: vi.fn(() => service) }
		platform = { Service: { Lightbulb: {} }, Characteristic: { On: 'On' } }
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
			markAccessoryNotResponding(platform as any, accessory as any)
			expect(updateCharacteristic).toHaveBeenCalledWith('On', new Error('Not Responding'))
		})
		it('should do nothing if Lightbulb service is missing', () => {
			accessory.getService = vi.fn(() => undefined)
			expect(() => markAccessoryNotResponding(platform as any, accessory as any)).not.toThrow()
		})
	})
})
