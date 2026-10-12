export function parseLedBrightness(value: unknown): number {
	const brightness = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value
	if (typeof brightness !== 'number' || !Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
		throw new Error('LED brightness must be an integer between 0 and 100')
	}
	return brightness
}

export function hexToHueSaturation(value: unknown): { hue: number; saturation: number } {
	if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
		throw new Error('LED colour must be a valid hex colour')
	}
	const hex = value.length === 4 ? value.slice(1).split('').map(c => c + c).join('') : value.slice(1)
	const [red, green, blue] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
	const max = Math.max(red, green, blue)
	const delta = max - Math.min(red, green, blue)
	if (delta === 0) {
		return { hue: 0, saturation: 0 }
	}
	const sector = max === red ? (green - blue) / delta : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
	return { hue: ((sector * 60) + 360) % 360, saturation: delta / max * 100 }
}

// UniFi stores brightness separately from the RGB colour.
export function hueSaturationToHex(hue: unknown, saturation: unknown): string {
	if (typeof hue !== 'number' || !Number.isFinite(hue) || hue < 0 || hue > 360 ||
		typeof saturation !== 'number' || !Number.isFinite(saturation) || saturation < 0 || saturation > 100) {
		throw new Error('Invalid LED hue or saturation')
	}
	const h = hue % 360
	const chroma = saturation / 100
	const secondary = chroma * (1 - Math.abs((h / 60) % 2 - 1))
	const minimum = 1 - chroma
	const channels = [
		[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
		[0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary],
	][Math.floor(h / 60)]
	return '#' + channels.map(channel => Math.round((channel + minimum) * 255).toString(16).padStart(2, '0')).join('')
}
