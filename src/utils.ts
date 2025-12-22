/**
 * Coerce a number or string to an integer
 */
export function toInt(value: number | string): number {
	const n = typeof value === 'number' ? value : Number(value)

	if (!Number.isInteger(n)) {
		throw new Error(`Expected integer, got: ${value}`)
	}

	return n
}

/**
 * Converts a CSS hex color string to an array of three color channel integers [r, g, b].
 * Handles both #RRGGBB and #RGB formats in any case.
 */
export function hexToRgb(hex: string): [number, number, number] {
	// Remove the hash if it exists
	let cleanHex = hex.startsWith('#') ? hex.slice(1) : hex

	// Handle shorthand format (#ABC -> #AABBCC)
	if (cleanHex.length === 3) {
		cleanHex = cleanHex.split('').map(char => char + char).join('')
	}

	if (cleanHex.length !== 6) {
		throw new Error(`Invalid hex color format: ${hex}`)
	}

	// Parse the values
	const r = parseInt(cleanHex.substring(0, 2), 16)
	const g = parseInt(cleanHex.substring(2, 4), 16)
	const b = parseInt(cleanHex.substring(4, 6), 16)

	if (isNaN(r) || isNaN(g) || isNaN(b)) {
		throw new Error(`Could not parse hex color: ${hex}`)
	}

	return [r, g, b]
}
