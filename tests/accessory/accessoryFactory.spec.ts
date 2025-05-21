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
				...mockPlatform,
				api: {
					platformAccessory: vi.fn((name, uuid) => ({
						name,
						uuid,
						context: {},
						getService: vi.fn(() => mockService),
						addService: vi.fn(() => mockService)
					})),
					registerPlatformAccessories: vi.fn(() => { throw new Error('register error') }),
				},
				log: { ...mockPlatform.log },
				accessories: [], // Ensure accessories array exists
			}
			const accessPoint = { name: 'AP', _id: 'id', site: 'default', model: 'UAP', serial: 'SN', version: '1.0.0' }
			const uuid = 'uuid-1'
			createAndRegisterAccessory(platformMock as any, accessPoint as any, uuid)
			expect(platformMock.log.error).toHaveBeenCalledWith(expect.stringContaining('Error during registerPlatformAccessories'))
		})

		it('should handle accessory with no site property (siteInfo fallback)', () => {
			const platformMock = {
				...mockPlatform,
				api: {
					platformAccessory: vi.fn((name, uuid) => ({
						name,
						uuid,
						context: {},
						getService: vi.fn(() => mockService),
						addService: vi.fn(() => mockService)
					})),
					registerPlatformAccessories: vi.fn(),
				},
				log: { ...mockPlatform.log },
				accessories: [], // Ensure accessories array exists
			}
			const accessPoint = { name: 'AP', _id: 'id' } // no site
			const uuid = 'uuid-1'
			createAndRegisterAccessory(platformMock as any, accessPoint as any, uuid)
			expect(platformMock.log.info).toHaveBeenCalledWith('[Accessory] Added new accessory: AP (id)')
		})

		it('should register accessory normally and log info', () => {
			const platformMock = {
				...mockPlatform,
				api: {
					platformAccessory: vi.fn((name, uuid) => ({
						name,
						uuid,
						context: {},
						getService: vi.fn(() => mockService),
						addService: vi.fn(() => mockService)
					})),
					registerPlatformAccessories: vi.fn(),
				},
				log: { ...mockPlatform.log },
				accessories: [], // Ensure accessories array exists
			}
			const accessPoint = { name: 'AP', _id: 'id', site: 'default' }
			const uuid = 'uuid-1'
			createAndRegisterAccessory(platformMock as any, accessPoint as any, uuid)
			expect(platformMock.log.info).toHaveBeenCalledWith('[Accessory] Added new accessory: AP (id)')
			expect(platformMock.api.registerPlatformAccessories).toHaveBeenCalled()
		})
	})

	describe('restoreAccessory', () => {
		it('should call UniFiAP constructor and log info', () => {
			const platformMock = {
				...mockPlatform,
				log: { ...mockPlatform.log },
			}
			const accessPoint = { _id: 'id', name: 'AP' } // no site
			const existingAccessory = {
				displayName: 'AP',
				context: { accessPoint },
				getService: vi.fn(() => mockService),
				addService: vi.fn(() => mockService)
			}
			expect(() => restoreAccessory(platformMock as any, accessPoint as any, existingAccessory as any)).not.toThrow()
			expect(platformMock.log.info).toHaveBeenCalledWith(expect.stringContaining('[Discovery] Matched device to cached accessory'))
		})
		it('should handle accessory with no site property (siteInfo fallback)', () => {
			const platformMock = {
				...mockPlatform,
				log: { ...mockPlatform.log },
			}
			const accessPoint = { _id: 'id', name: 'AP' } // no site
			const existingAccessory = {
				displayName: 'AP',
				context: { accessPoint },
				getService: vi.fn(() => mockService),
				addService: vi.fn(() => mockService)
			}
			expect(() => restoreAccessory(platformMock as any, accessPoint as any, existingAccessory as any)).not.toThrow()
			expect(platformMock.log.info).toHaveBeenCalledWith(expect.stringContaining('[Discovery] Matched device to cached accessory'))
		})
	})

	describe('removeAccessory', () => {
		it('should handle error in unregisterPlatformAccessories', () => {
			const platformMock = {
				...mockPlatform,
				api: {
					unregisterPlatformAccessories: vi.fn(() => { throw new Error('unregister error') }),
				},
				accessories: [{ UUID: 'uuid-1' }],
				log: { ...mockPlatform.log },
			}
			const accessory = { UUID: 'uuid-1', displayName: 'AP', context: { accessPoint: { _id: 'id', name: 'AP', site: 'default' } } }
			removeAccessory(platformMock as any, accessory as any)
			expect(platformMock.log.error).toHaveBeenCalledWith(expect.stringContaining('Error during unregisterPlatformAccessories'))
		})
		it('should handle accessory with no site property (siteInfo fallback)', () => {
			const platformMock = {
				...mockPlatform,
				log: { ...mockPlatform.log },
				api: { unregisterPlatformAccessories: vi.fn() },
				accessories: [{ UUID: 'uuid-1', context: { accessPoint: { name: 'AP', _id: 'id' } } }],
				config: {},
			}
			const accessory = { UUID: 'uuid-1', displayName: 'AP', context: { accessPoint: { name: 'AP', _id: 'id' } } }
			removeAccessory(platformMock as any, accessory as any)
			expect(platformMock.log.info).toHaveBeenCalledWith('[Exclusion] Removing accessory from cache: AP (id)')
		})
		it('should remove accessory normally if found', () => {
			const platformMock = {
				...mockPlatform,
				api: { unregisterPlatformAccessories: vi.fn() },
				accessories: [{ UUID: 'uuid-1' }, { UUID: 'uuid-2' }],
				log: { ...mockPlatform.log },
			}
			const accessory = { UUID: 'uuid-1', displayName: 'AP', context: { accessPoint: { _id: 'id', name: 'AP', site: 'default' } } }
			removeAccessory(platformMock as any, accessory as any)
			expect(platformMock.api.unregisterPlatformAccessories).toHaveBeenCalled()
			expect(platformMock.accessories).toEqual([{ UUID: 'uuid-2' }])
		})
		it('should do nothing if accessory is not found in platform.accessories', () => {
			const platformMock = {
				...mockPlatform,
				api: { unregisterPlatformAccessories: vi.fn() },
				accessories: [{ UUID: 'uuid-2' }],
				log: { ...mockPlatform.log },
			}
			const accessory = { UUID: 'uuid-1', displayName: 'AP', context: { accessPoint: { _id: 'id', name: 'AP', site: 'default' } } }
			removeAccessory(platformMock as any, accessory as any)
			expect(platformMock.api.unregisterPlatformAccessories).toHaveBeenCalled()
			expect(platformMock.accessories).toEqual([{ UUID: 'uuid-2' }])
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
