/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'UnifiAPLight'

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-unifi-ap-light'

/**
 * Send updates after this delay (milliseconds) to mitigate race condition from
 * HomeKit setting multiple characteristics at the same time
 */
export const CHARACTERISTIC_UPDATE_DELAY = 50
