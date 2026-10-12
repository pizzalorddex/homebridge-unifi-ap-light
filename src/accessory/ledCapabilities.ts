import type { UnifiDevice } from '../models/unifiTypes.js'

// UniFi's LED ring capability is bit 1 of hw_caps.
const LED_RING = 1 << 1

export function hasRgbLedCapability(device: Pick<UnifiDevice, 'type' | 'hw_caps'>): boolean {
	const capabilities = device.hw_caps
	return device.type === 'uap' &&
		typeof capabilities === 'number' &&
		Number.isSafeInteger(capabilities) &&
		capabilities >= 0 &&
		(capabilities & LED_RING) !== 0
}
