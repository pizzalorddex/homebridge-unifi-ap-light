/**
 * Type definitions and error classes for UniFi API integration.
 *
 * These types are used throughout the plugin for type safety and clarity.
 */
import { PlatformConfig } from 'homebridge'

/**
 * Represents a UniFi site as returned by the controller API.
 * @property {string} name The internal site name.
 * @property {string} desc The user-friendly site description.
 */
export interface UnifiSite {
  name: string;
  desc: string;
}

/**
 * LED settings for a UniFi device (e.g., UDM).
 * @property {boolean} [enabled] Whether the LED is enabled (UDM/UDR only).
 */
export interface UnifiLedSettings {
  enabled?: boolean;
}

/**
 * Represents a UniFi device (AP, UDM, etc) as returned by the controller API.
 * @property {string} _id The unique device ID.
 * @property {string} mac The MAC address of the device.
 * @property {string} site The site name this device belongs to.
 * @property {string} type The device type (e.g., 'uap', 'udm').
 * @property {string} model The device model (e.g., 'UDM', 'UDR').
 * @property {string} name The device name.
 * @property {string} serial The device serial number.
 * @property {string} version The firmware version.
 * @property {string} [led_override] The LED override state (for APs).
 * @property {UnifiLedSettings} [ledSettings] The LED settings (for UDM/UDR).
 */
export interface UnifiDevice {
  _id: string;
  mac: string;
  site: string;
  type: string;
  model: string;
  name: string;
  serial: string;
  version: string;
  led_override?: string;
  ledSettings?: UnifiLedSettings;
}

/**
 * Generic API response wrapper for UniFi controller endpoints.
 * @property {Object} [meta] Optional metadata about the response.
 * @property {T[]} data The array of returned data objects.
 * @template T
 */
export interface UnifiApiResponse<T> {
  meta?: { rc: string; msg?: string };
  data: T[];
}

/**
 * Homebridge platform config for this plugin.
 * Extends PlatformConfig with required UniFi fields.
 * @property {string} host The hostname or IP address of the UniFi Controller.
 * @property {string} username The username for the UniFi Controller.
 * @property {string} password The password for the UniFi Controller.
 * @property {string[]} [sites] Optional list of UniFi site names to control.
 * @property {string[]} [includeIds] Optional list of specific device IDs to include.
 * @property {string[]} [excludeIds] Optional list of device IDs to exclude.
 * @property {number} [refreshIntervalMinutes] How often to refresh the device cache, in minutes. Default is 10.
 */
export interface UnifiAPLightConfig extends PlatformConfig {
  host: string;
  username: string;
  password: string;
  sites?: string[];
  includeIds?: string[];
  excludeIds?: string[];
  refreshIntervalMinutes?: number;
}

/**
 * Error thrown for generic UniFi API failures.
 * @augments Error
 */
export class UnifiApiError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiApiError'
	}
}

/**
 * Error thrown for authentication failures with the UniFi controller.
 * @augments Error
 */
export class UnifiAuthError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiAuthError'
	}
}

/**
 * Error thrown for invalid or missing plugin configuration.
 * @augments Error
 */
export class UnifiConfigError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiConfigError'
	}
}

/**
 * Error thrown for network-level failures (e.g., controller unreachable).
 * @augments Error
 */
export class UnifiNetworkError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message)
		this.name = 'UnifiNetworkError'
	}
}
