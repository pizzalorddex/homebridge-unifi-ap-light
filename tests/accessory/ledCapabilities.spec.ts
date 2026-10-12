import { describe, expect, it } from 'vitest'
import { hasRgbLedCapability } from '../../src/accessory/ledCapabilities.js'
import type { UnifiDevice } from '../../src/models/unifiTypes.js'

describe('LED hardware capabilities', () => {
	it.each([2, 3, 2562, 2 ** 32 + 2])('recognises the LED ring bit in %s', hw_caps => {
		expect(hasRgbLedCapability({ type: 'uap', hw_caps })).toBe(true)
	})

	it.each([0, 1, 2560, undefined])('keeps APs without the LED ring bit on/off only: %s', hw_caps => {
		expect(hasRgbLedCapability({ type: 'uap', hw_caps })).toBe(false)
	})

	it.each(['2', '2562', null, NaN, Infinity, -1, 2.5, Number.MAX_SAFE_INTEGER + 1])(
		'rejects malformed capability data: %s', hw_caps => {
			const device = { type: 'uap', hw_caps } as unknown as UnifiDevice
			expect(hasRgbLedCapability(device)).toBe(false)
		})

	it.each(['udm', 'usw', 'ugw', 'unknown'])('does not select AP colour controls for %s', type => {
		expect(hasRgbLedCapability({ type, hw_caps: 2 })).toBe(false)
	})

	it('does not infer colour support from saved colour and brightness fields', () => {
		const device = { type: 'uap', hw_caps: 2560, led_override_color: '#0000ff',
			led_override_color_brightness: '100' }
		expect(hasRgbLedCapability(device)).toBe(false)
	})
})
