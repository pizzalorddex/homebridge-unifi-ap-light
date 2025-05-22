# homebridge-unifi-ap-light
Control the light rings on your UniFi Access Point(s) with HomeKit!

## Features
- **Multi-Site Support:** Control APs across multiple UniFi sites (tenants) in a single Homebridge config.
- **Dynamic Discovery:** Automatically finds UniFi APs across specified sites.
- **Real-time Updates:** HomeKit changes instantly reflect on your access points.
- **Advanced Filtering:** Include/exclude specific APs by ID.
- **Robust Session Management:** Handles cookie- and token-based API authentication.
- **Device Cache:** Device state is cached and refreshed periodically (default: every 10 minutes).
- **Comprehensive Error Handling:** Log suppression, throttling, and recovery logic to keep logs clean and the plugin resilient.

## Requirements
- **Node.js:** >=20.0.0 <23.0.0
- **Homebridge:** >=1.8.0

## Installation
Search for `homebridge-unifi-ap-light` in the Homebridge UI, or run:

```sh
npm install -g homebridge-unifi-ap-light
```

Or, with Yarn:

```sh
yarn global add homebridge-unifi-ap-light
```

## Configuration

### Basic Example
1. Create a dedicated UniFi OS local user (not your UI.com account).
2. Add the following to your Homebridge `config.json`:

```json
{
  "name": "UniFi AP Lights",
  "platform": "UnifiAPLight",
  "host": "<hostname>:<port>",
  "username": "<username>",
  "password": "<password>"
}
```
- For self-hosted controllers, include the port (e.g., `"192.168.1.1:8443"`).
- For UniFi devices like UDM/UDR, omit the port (e.g., `"192.168.1.1"`).

### Optional: Multi-Site & Filtering

```json
{
  "sites": ["Default", "mySite"],
  "includeIds": ["<device-id-1>", "<device-id-2>"],
  "excludeIds": ["<device-id-3>"]
}
```
- `sites`: Specify friendly or internal site names. The plugin resolves them automatically.
- `includeIds`: Only these device IDs are shown in HomeKit.
- `excludeIds`: These device IDs are always excluded.

### Optional: Device Cache Refresh Interval

```json
{
  "refreshIntervalMinutes": 5
}
```
*Set the device cache refresh interval to 5 minutes (default is 10). If the controller is unreachable, the plugin logs an error and retries at the next interval.*

## How It Works
- On startup, the plugin lists all detected sites and discovered APs.
- Device state is cached and refreshed on a schedule.
- If the UniFi controller is unreachable, HomeKit accessories show as "Not Responding" until recovery.
- All error handling is robustly tested to ensure HomeKit accurately reflects accessory status.

## Advanced Error Handling, Log Suppression, and Recovery
- **Log Suppression:** Repeated error/info logs (e.g., recovery attempts) are automatically suppressed to prevent log spam.
- **Error Throttling:** Errors are logged with context and throttled to avoid flooding the Homebridge log.
- **Recovery Logic:**
  - If the UniFi controller or APs become unreachable, the plugin attempts recovery and refreshes the device cache.
  - Recovery attempts are locked to prevent concurrent runs.
  - If recovery fails (e.g., controller is still starting up), the plugin retries at the next interval or on the next error trigger.
  - **Note:** After a UniFi Console reboot or update, it may take several minutes for the controller and APs to become available. The plugin logs errors and retries automatically; no manual intervention is needed.

## Debugging & Troubleshooting
- Run Homebridge in debug mode (`homebridge -D`) to view detailed logs.
- On startup, the plugin lists all detected sites:
  ```
  [UniFi AP Lights] Available sites loaded: Default, default, mySite, p2yvd0iv
  ```
- If a site is not recognized:
  ```
  Site "xyz" is not recognized by the controller (api.err.NoSiteContext).
  ```
- **Authentication fails:**
  - Use a UniFi OS local user, not a UI.com account.
  - Double-check your username and password.
- **Site not recognized:**
  - Check spelling/case of your site name.
  - Use the internal site name if the friendly name does not work.
- **No devices found:**
  - Ensure your user has permission to view devices in the UniFi controller.
  - Check network connectivity between Homebridge and the UniFi controller.

## Local Testing with Docker
A Docker Compose environment is provided for local Homebridge testing (including v2 compatibility):

1. See the `docker/README.md` for setup instructions.
2. The Docker environment includes the Homebridge UI and is pre-configured for easy plugin development and testing.
3. Your plugin and config are mounted from the local `docker/config` folder.

## Quality & Coverage
- This plugin is fully covered by automated tests and maintains high code coverage.

## License
This project is licensed under the Apache 2.0 License — see the [LICENSE](LICENSE) file for details.
