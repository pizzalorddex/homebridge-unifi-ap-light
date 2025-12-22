/**
 * State information that HomeKit keeps for accessories
 */
export class HsvDeviceState {
	constructor(
		public isOn: boolean,
		public Hue: number,
		public Saturation: number,
		public Brightness: number,
	) {}

	/**
	 * Transforms the HSV state into an RgbDeviceState.
	 * On maps to isOn, Brightness maps to Brightness.
	 * Hue and Saturation are converted to R, G, and B (0-255).
	 */
	toRgbState(): RgbDeviceState {
		const h = this.Hue
		const s = this.Saturation / 100
		const v = 1 // We compute RGB from H/S only, so we treat Value as 100%

		const c = v * s
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
		const m = v - c

		let r1 = 0; let g1 = 0; let 
			b1 = 0

		if (h >= 0 && h < 60) {
			[r1, g1, b1] = [c, x, 0]
		} else if (h >= 60 && h < 120) {
			[r1, g1, b1] = [x, c, 0]
		} else if (h >= 120 && h < 180) {
			[r1, g1, b1] = [0, c, x]
		} else if (h >= 180 && h < 240) {
			[r1, g1, b1] = [0, x, c]
		} else if (h >= 240 && h < 300) {
			[r1, g1, b1] = [x, 0, c]
		} else if (h >= 300 && h < 360) {
			[r1, g1, b1] = [c, 0, x]
		}

		return new RgbDeviceState(
			this.isOn,
			Math.round((r1 + m) * 255),
			Math.round((g1 + m) * 255),
			Math.round((b1 + m) * 255),
			this.Brightness,
		)
	}
}

/**
 * State information for a Unifi AP
 */
export class RgbDeviceState {
	constructor(
		public isOn: boolean,
		public R: number,
		public G: number,
		public B: number,
		public Brightness: number,
	) {}

	private getHsvData() {
		const r = this.R / 255
		const g = this.G / 255
		const b = this.B / 255

		const max = Math.max(r, g, b)
		const min = Math.min(r, g, b)
		const delta = max - min

		return { r, g, b, max, delta }
	}

	/**
	 * Computes the Hue (0-360) from the RGB values.
	 * This implementation ignores the Brightness property.
	 */
	get hue(): number {
		const { r, g, b, max, delta } = this.getHsvData()

		if (delta === 0) {
			return 0
		}

		let h = 0
		if (max === r) {
			h = ((g - b) / delta) % 6
		} else if (max === g) {
			h = (b - r) / delta + 2
		} else {
			h = (r - g) / delta + 4
		}

		h = Math.round(h * 60)

		if (h < 0) {
			h += 360
		}

		return h
	}

	/**
	 * Computes the Saturation (0-100) from the RGB values.
	 * This implementation ignores the Brightness property.
	 */
	get saturation(): number {
		const { max, delta } = this.getHsvData()

		if (max === 0) {
			return 0
		}

		return Math.round((delta / max) * 100)
	}

	/**
	 * Converts the R, G, and B values into a CSS-style hex string (e.g., "#79219e").
	 */
	get hex(): string {
		const toHex = (n: number) => n.toString(16).padStart(2, '0')
		return `#${toHex(this.R)}${toHex(this.G)}${toHex(this.B)}`
	}
}
