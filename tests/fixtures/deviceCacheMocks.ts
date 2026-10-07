import { vi } from 'vitest'
export const setDevices = vi.fn()
export const clear = vi.fn()

export function getMockDeviceCache() {
	setDevices.mockClear()
	clear.mockClear()
	return { setDevices, clear }
}
