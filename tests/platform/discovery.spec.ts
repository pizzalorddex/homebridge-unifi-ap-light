import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock getAccessPoints and markAccessoryNotResponding at the top level
let getAccessPoints: any
let markAccessoryNotResponding: any
const restoreAccessory = vi.fn()
const removeAccessory = vi.fn()
const createAndRegisterAccessory = vi.fn()
vi.mock('../../src/unifi', () => ({
	getAccessPoints: (...args: any[]) => getAccessPoints(...args)
}))
vi.mock('../../src/utils/errorHandler', async () => {
	const actual = await import('../../src/utils/errorHandler')
	return {
		...actual,
		markAccessoryNotResponding: (...args) => markAccessoryNotResponding(...args),
	}
})
vi.mock('../../src/accessory/accessoryFactory', () => ({
	restoreAccessory: (...args: any[]) => restoreAccessory(...args),
	removeAccessory: (...args: any[]) => removeAccessory(...args),
	createAndRegisterAccessory: (...args: any[]) => createAndRegisterAccessory(...args),
}))

import { discoverDevices } from '../../src/platform/discovery'

// Top-level spies for device cache
const setDevices = vi.fn()
const clear = vi.fn()

// Mocks for platform and dependencies
describe('discoverDevices', () => {
	let platform: any

	beforeEach(async () => {
		setDevices.mockClear()
		clear.mockClear()
		removeAccessory.mockClear()
		removeAccessory.mockImplementation((platformArg, accessoryArg) => {
			const idx = platformArg.accessories.findIndex((acc: any) => acc.UUID === accessoryArg.UUID)
			if (idx !== -1) {
				platformArg.accessories.splice(idx, 1)
			}
		})
		const accessories = [
			{
				UUID: 'uuid-1',
				displayName: 'AP1',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
				context: { accessPoint: { _id: 'uuid-1' } },
			},
			{
				UUID: 'uuid-2',
				displayName: 'AP2',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
				context: { accessPoint: { _id: 'uuid-2' } },
			},
		]

		platform = {
			log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
			config: { sites: ['default'], includeIds: [], excludeIds: [] },
			api: { hap: { uuid: { generate: vi.fn((id: string) => `uuid-${id}`) } } },
			accessories: [...accessories],
			getDeviceCache: vi.fn(() => ({ setDevices, clear })),
			Service: { Lightbulb: 'Lightbulb' },
			Characteristic: { On: 'On' },
			sessionManager: {
				authenticate: vi.fn().mockResolvedValue(undefined),
				getSiteName: vi.fn((site: string) => site === 'default' ? 'default' : undefined),
				getApiHelper: vi.fn(() => ({})),
				request: vi.fn(),
			},
		}
		getAccessPoints = vi.fn()
		markAccessoryNotResponding = vi.fn()
		restoreAccessory.mockClear()
		removeAccessory.mockClear()
		createAndRegisterAccessory.mockClear()
	})

	describe('normal operation', () => {
		it('authenticates and discovers devices, registering new accessories', async () => {
			getAccessPoints.mockResolvedValue([
				{ _id: '1', type: 'uap' },
				// Only 'uap' is valid, 'udm' is not valid unless it has model 'UDM' or 'UDR'
			])
			platform.accessories = [] // Ensure no existing accessories
			await discoverDevices(platform)
			expect(platform.sessionManager.authenticate).toHaveBeenCalled()
			expect(getAccessPoints).toHaveBeenCalled()
			expect(platform.getDeviceCache().setDevices).toHaveBeenCalledWith([
				{ _id: '1', type: 'uap' },
			])
			expect(createAndRegisterAccessory).toHaveBeenCalledTimes(1)
		})

		it('authenticates and discovers devices, registering new accessories (using fixture)', async () => {
			const { loadFixture } = await import('../fixtures/apiFixtures')
			const { data } = loadFixture('device-list-success.fixture.json')
			const apsOnly = data.filter((d: any) => d.type === 'uap' || d.type === 'udm')
			getAccessPoints.mockResolvedValue(data)
			platform.accessories = [] // Ensure no existing accessories
			await discoverDevices(platform)
			expect(platform.sessionManager.authenticate).toHaveBeenCalled()
			expect(getAccessPoints).toHaveBeenCalled()
			expect(platform.getDeviceCache().setDevices).toHaveBeenCalledWith(apsOnly)
		})

		it('restores existing accessories if included', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'uuid-1', type: 'uap' }])
			platform.accessories = [{
				UUID: 'uuid-uuid-1',
				displayName: 'AP1',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			expect(restoreAccessory).toHaveBeenCalledWith(platform, { _id: 'uuid-1', type: 'uap' }, platform.accessories[0])
		})

		it('removes excluded accessories', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'ap1' }])
			platform.config.excludeIds = ['ap1']
			platform.accessories = [{
				UUID: 'uuid-ap1',
				displayName: 'AP1',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
				context: { accessPoint: { _id: 'ap1' } },
			}]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			expect(removeAccessory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ UUID: 'uuid-ap1' }))
		})

		it('does not register excluded accessories', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'ap1' }])
			platform.config.excludeIds = ['ap1']
			platform.accessories = [{
				UUID: 'uuid-ap1',
				displayName: 'AP1',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(createAndRegisterAccessory).not.toHaveBeenCalled()
		})

		it('warns and aborts if no valid sites', async () => {
			platform.config.sites = ['invalid']
			platform.sessionManager.getSiteName = vi.fn(() => undefined)
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('No valid sites resolved. Aborting discovery.')
		})

		it('warns if no access points discovered', async () => {
			getAccessPoints.mockResolvedValue([])
			await discoverDevices(platform)
			expect(platform.log.warn).toHaveBeenCalledWith('No relevant access points discovered. Check your site configuration, include/exclude settings, and permissions.')
		})
	})

	describe('error handling', () => {
		it('handles authentication failure (UnifiAuthError)', async () => {
			const unifiTypesMod = await import('../../src/models/unifiTypes')
			const UnifiAuthError = unifiTypesMod.UnifiAuthError
			platform.sessionManager.authenticate = vi.fn().mockRejectedValue(new UnifiAuthError('fail'))
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('Authentication error [endpoint: authentication (device discovery)]: fail')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})

		it('handles authentication failure (generic error)', async () => {
			platform.sessionManager.authenticate = vi.fn().mockRejectedValue(new Error('fail'))
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('Error [endpoint: authentication (device discovery)]: fail')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})

		it('handles authentication failure with a string error (String(err) branch)', async () => {
			platform.sessionManager.authenticate = vi.fn().mockRejectedValue('authfailstr')
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('Error [endpoint: authentication (device discovery)]: authfailstr')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})

		it('handles UnifiApiError during discovery', async () => {
			const unifiTypesMod = await import('../../src/models/unifiTypes')
			const UnifiApiError = unifiTypesMod.UnifiApiError
			getAccessPoints.mockImplementation(() => { throw new UnifiApiError('api fail') })
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('API error [endpoint: device discovery]: api fail')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})

		it('handles UnifiNetworkError during discovery', async () => {
			const unifiTypesMod = await import('../../src/models/unifiTypes')
			const UnifiNetworkError = unifiTypesMod.UnifiNetworkError
			getAccessPoints.mockImplementation(() => { throw new UnifiNetworkError('net fail') })
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('Network error [endpoint: device discovery]: net fail')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})

		it('handles generic error during discovery', async () => {
			getAccessPoints.mockImplementation(() => { throw new Error('fail') })
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('Error [endpoint: device discovery]: fail')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})

		it('handles string error during discovery', async () => {
			getAccessPoints.mockImplementation(() => { throw 'failstr' })
			platform.accessories = [{
				UUID: 'uuid-err',
				displayName: 'ErrorAP',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			}]
			await discoverDevices(platform)
			expect(platform.log.error).toHaveBeenCalledWith('Error [endpoint: device discovery]: failstr')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})
	})

	describe('branch/edge cases', () => {
		it('falls back to ["default"] if config.sites is missing', async () => {
			delete platform.config.sites
			getAccessPoints.mockResolvedValue([{ _id: '1', type: 'uap' }])
			platform.accessories = []
			await discoverDevices(platform)
			expect(platform.sessionManager.authenticate).toHaveBeenCalled()
			expect(getAccessPoints).toHaveBeenCalled()
			expect(platform.getDeviceCache().setDevices).toHaveBeenCalledWith([{ _id: '1', type: 'uap' }])
		})

		it('falls back to ["default"] if config.sites is empty array', async () => {
			platform.config.sites = []
			getAccessPoints.mockResolvedValue([{ _id: '1', type: 'uap' }])
			platform.accessories = []
			await discoverDevices(platform)
			expect(platform.sessionManager.authenticate).toHaveBeenCalled()
			expect(getAccessPoints).toHaveBeenCalled()
			expect(platform.getDeviceCache().setDevices).toHaveBeenCalledWith([{ _id: '1', type: 'uap' }])
		})

		it('removes excluded accessory if present', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'ap1', type: 'uap' }])
			platform.config.excludeIds = ['ap1']
			platform.config.includeIds = undefined // fallback: isIncluded = true
			platform.accessories = [{
				UUID: 'uuid-ap1',
				displayName: 'AP1',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
				context: { accessPoint: { _id: 'ap1' } },
			}]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			expect(removeAccessory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ UUID: 'uuid-ap1' }))
		})

		it('registers only included accessories when includeIds is set', async () => {
			getAccessPoints.mockResolvedValue([
				{ _id: 'ap1', type: 'uap' },
				{ _id: 'ap2', type: 'uap' },
			])
			platform.config.includeIds = ['ap2']
			platform.config.excludeIds = []
			platform.accessories = []
			await discoverDevices(platform)
			expect(createAndRegisterAccessory).toHaveBeenCalledTimes(1)
			expect(createAndRegisterAccessory).toHaveBeenCalledWith(platform, { _id: 'ap2', type: 'uap' }, 'uuid-ap2')
		})
	})

	describe('accessory handling branches', () => {
		it('removes an accessory if it is excluded and already exists (else if isExcluded branch)', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'apX', type: 'uap' }])
			platform.config.includeIds = undefined // fallback: isIncluded = true
			platform.config.excludeIds = ['apX']
			platform.accessories = [{
				UUID: 'uuid-apX',
				displayName: 'APX',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
				context: { accessPoint: { _id: 'apX' } },
			}]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			expect(removeAccessory).toHaveBeenCalledWith(platform, expect.objectContaining({ UUID: 'uuid-apX' }))
			expect(createAndRegisterAccessory).not.toHaveBeenCalled()
			expect(restoreAccessory).not.toHaveBeenCalled()
		})

		it('creates a new accessory if it is included and not excluded, and does not already exist (else if isIncluded && !isExcluded branch)', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'apY', type: 'uap' }])
			platform.config.includeIds = ['apY']
			platform.config.excludeIds = []
			platform.accessories = [] // No existing accessory
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			expect(createAndRegisterAccessory).toHaveBeenCalledWith(platform, { _id: 'apY', type: 'uap' }, 'uuid-apY')
			expect(removeAccessory).not.toHaveBeenCalled()
			expect(restoreAccessory).not.toHaveBeenCalled()
		})

		it('removes an accessory in the cleanup step if it is not in includeIds', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'apZ', type: 'uap' }])
			platform.config.includeIds = ['apZ']
			platform.config.excludeIds = []
			platform.accessories = [
				{
					UUID: 'uuid-apZ',
					displayName: 'APZ',
					getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
					context: { accessPoint: { _id: 'apZ' } },
				},
				{
					UUID: 'uuid-apW',
					displayName: 'APW',
					getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
					context: { accessPoint: { _id: 'apW' } },
				},
			]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			// apW is not in includeIds, so should be removed in cleanup
			expect(removeAccessory).toHaveBeenCalledWith(platform, expect.objectContaining({ UUID: 'uuid-apW' }))
			// apZ should not be removed
			expect(removeAccessory).not.toHaveBeenCalledWith(platform, expect.objectContaining({ UUID: 'uuid-apZ' }))
		})

		it('removes accessory in cleanup if it exists but is neither included nor excluded (else branch)', async () => {
			getAccessPoints.mockResolvedValue([{ _id: 'apN', type: 'uap' }])
			platform.config.includeIds = ['something-else'] // apN is not included
			platform.config.excludeIds = ['something-else'] // apN is not excluded
			platform.accessories = [{
				UUID: 'uuid-apN',
				displayName: 'APN',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
				context: { accessPoint: { _id: 'apN' } },
			}]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			expect(removeAccessory).toHaveBeenCalledTimes(1)
			expect(removeAccessory).toHaveBeenCalledWith(platform, expect.objectContaining({ UUID: 'uuid-apN' }))
			expect(restoreAccessory).not.toHaveBeenCalled()
			expect(createAndRegisterAccessory).not.toHaveBeenCalled()
		})
	})
})
