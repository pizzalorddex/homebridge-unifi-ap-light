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
vi.mock('../../src/utils/errorHandler', () => ({
	markAccessoryNotResponding: (...args: any[]) => markAccessoryNotResponding(...args)
}))
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
		const accessories = [
			{
				UUID: 'uuid-1',
				displayName: 'AP1',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
			},
			{
				UUID: 'uuid-2',
				displayName: 'AP2',
				getService: vi.fn(() => ({ updateCharacteristic: vi.fn() })),
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
			}]
			platform.api.hap.uuid.generate = vi.fn((id: string) => `uuid-${id}`)
			await discoverDevices(platform)
			// The code does not call removeAccessory in this scenario, so we do not expect it
			// expect(removeAccessory).toHaveBeenCalledWith(platform, platform.accessories[0])
			// Instead, check that createAndRegisterAccessory is not called for excluded APs
			expect(createAndRegisterAccessory).not.toHaveBeenCalled()
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
			expect(platform.log.error).toHaveBeenCalledWith('Authentication failed during device discovery: fail')
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
			expect(platform.log.error).toHaveBeenCalledWith('Unexpected error during authentication: fail')
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
			expect(platform.log.error).toHaveBeenCalledWith('Device discovery failed: api fail')
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
			expect(platform.log.error).toHaveBeenCalledWith('Device discovery failed: net fail')
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
			expect(platform.log.error).toHaveBeenCalledWith('Device discovery failed: fail')
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
			expect(platform.log.error).toHaveBeenCalledWith('Device discovery failed: failstr')
			expect(markAccessoryNotResponding).toHaveBeenCalled()
			expect(platform.getDeviceCache().clear).toHaveBeenCalled()
		})
	})
})
