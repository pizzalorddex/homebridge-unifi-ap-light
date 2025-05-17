import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAndRegisterAccessory, markAccessoryNotResponding } from '../../src/accessoryFactory.js'

// Shared mock objects for all tests
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
