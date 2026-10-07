import type { PlatformConfig } from 'homebridge'

export interface UnifiSite {
	name: string
	desc: string
}

export interface UnifiLedSettings {
	enabled?: boolean
}

export interface UnifiDevice {
	_id: string
	mac: string
	site: string
	type: string
	model: string
	name: string
	serial: string
	version: string
	led_override?: string
	ledSettings?: UnifiLedSettings
	last_seen?: number
	uptime?: number
	state?: number
}

export interface UnifiApiResponse<T> {
	meta?: { rc: string; msg?: string }
	data: T[]
}

export interface UnifiAPLightConfig extends PlatformConfig {
	host: string
	username: string
	password: string
	sites?: string[]
	includeIds?: string[]
	excludeIds?: string[]
	refreshIntervalMinutes?: number
}

export class UnifiApiError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiApiError'
	}
}

export class UnifiAuthError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiAuthError'
	}
}

export class UnifiConfigError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiConfigError'
	}
}

export class UnifiNetworkError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiNetworkError'
	}
}
