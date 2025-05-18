import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markAccessoryNotResponding, markThisAccessoryNotResponding } from '../../src/utils/errorHandler'
import { mockPlatform } from '../fixtures/homebridgeMocks'

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

		it('logs a warning if service does not exist and context has accessPoint', () => {
			const accessory = {
				getService: vi.fn(() => undefined),
				context: { accessPoint: { name: 'AP', _id: 'id', site: 'site' } },
				displayName: 'Test',
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(mockPlatform.log.warn).toHaveBeenCalledWith(
				'Accessory Information Service not found for AP (id, site: site)'
			)
		})

		it('logs a warning with fallback values if service does not exist and context/accessPoint is missing', () => {
			const accessory = {
				getService: vi.fn(() => undefined),
				context: {},
				displayName: 'TestName',
			}
			markAccessoryNotResponding(mockPlatform as any, accessory as any)
			expect(mockPlatform.log.warn).toHaveBeenCalledWith(
				'Accessory Information Service not found for TestName (unknown, site: unknown)'
			)
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
			const instance = {
				service: undefined,
				platform: mockPlatform,
				accessPoint: { name: 'AP', _id: 'id', site: 'site' },
			}
			markThisAccessoryNotResponding(instance as any)
			expect(instance.platform.log.warn).toHaveBeenCalledWith(
				'Accessory Information Service not found for AP (id, site: site)'
			)
		})
	})
})
