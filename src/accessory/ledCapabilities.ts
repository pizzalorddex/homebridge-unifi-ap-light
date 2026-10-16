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

export function hasBrightnessLedCapability(device: Pick<UnifiDevice, 'type' | 'model' | 'hw_caps'>): boolean {
	// U7 Pro supports dimming without the RGB ring bit. Other models need evidence.
	return device.type === 'uap' && (device.model === 'U7PRO' || hasRgbLedCapability(device))
}
