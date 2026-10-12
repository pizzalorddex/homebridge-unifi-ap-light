import { describe, expect, it } from 'vitest'
import { hexToHueSaturation, hueSaturationToHex, parseLedBrightness } from '../../src/accessory/ledColor.js'

describe('LED colour conversion', () => {
	it.each([
		[0, 100, '#ff0000'], [60, 100, '#ffff00'], [120, 100, '#00ff00'],
		[180, 100, '#00ffff'], [240, 100, '#0000ff'], [300, 100, '#ff00ff'],
		[360, 100, '#ff0000'], [42, 0, '#ffffff'], [0, 50, '#ff8080'],
	] as const)('converts known hue/saturation %s/%s', (hue, saturation, hex) => {
		expect(hueSaturationToHex(hue, saturation)).toBe(hex)
	})

	it.each([
		['#ff0000', 0, 100], ['#00FF00', 120, 100], ['#00f', 240, 100],
		['#00ffff', 180, 100], ['#ff00ff', 300, 100], ['#808000', 60, 100],
		['#ffffff', 0, 0], ['#808080', 0, 0], ['#000000', 0, 0],
	] as const)('reads known controller colour %s', (hex, hue, saturation) => {
		const result = hexToHueSaturation(hex)
		expect(result.hue).toBeCloseTo(hue)
		expect(result.saturation).toBeCloseTo(saturation)
	})

	it.each(['#0g0000', '#ggg', '0000ff', '#abcd', '', undefined, null, 100])('rejects malformed colour %s', value => {
		expect(() => hexToHueSaturation(value)).toThrow('valid hex colour')
	})

	it.each([-1, 361, NaN, Infinity, '120', undefined])('rejects invalid hue %s', value => {
		expect(() => hueSaturationToHex(value, 100)).toThrow('Invalid LED hue')
	})

	it.each([-1, 101, NaN, Infinity, '100', undefined])('rejects invalid saturation %s', value => {
		expect(() => hueSaturationToHex(0, value)).toThrow('Invalid LED hue')
	})

	it('retains a precise non-primary hue across a colour roundtrip', () => {
		const colour = hueSaturationToHex(212.5, 64.5)
		const read = hexToHueSaturation(colour)
		expect(Math.abs(read.hue - 212.5)).toBeLessThan(1)
		expect(Math.abs(read.saturation - 64.5)).toBeLessThan(1)
	})
})

describe('LED brightness', () => {
	it.each([0, 1, 75, 100, '0', '75', '100'])('reads controller brightness %s', value => {
		expect(parseLedBrightness(value)).toBe(Number(value))
	})
	it.each([-1, 101, 2.5, NaN, Infinity, '', ' ', '10x', '1e2', '75.5', true, null, undefined])('rejects brightness %s', value => {
		expect(() => parseLedBrightness(value)).toThrow('integer between 0 and 100')
	})
})
