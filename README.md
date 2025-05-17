# homebridge-unifi-ap-light
Control the light rings on your UniFi Access Point(s) with HomeKit!

## Features
- **Multi-Site Support:** Supports multiple UniFi sites (tenants) in a single Homebridge config.
- **Dynamic Discovery:** Automatically discovers UniFi APs across one or more specified sites.
- **Real-time Updates:** Changes made in HomeKit instantly reflect on your access points.
- **Advanced Filtering:** Include or exclude specific APs by ID.
- **Compatibility:** Supports self-hosted and UniFi OS API structures.
- **Session Management:** Robust handling of cookie- and token-based API authentication.
- **Device Cache:** Device state is cached and refreshed periodically (default: every 10 minutes).

## Requirements
- **Node.js:** >=20.0.0 <23.0.0
- **Homebridge:** >=1.5.0

## Installation
Search for `homebridge-unifi-ap-light` in the Homebridge UI, or run:

```sh
npm install -g homebridge-unifi-ap-light
```

Or, with Yarn:

```sh
yarn global add homebridge-unifi-ap-light
```

## Usage

1. Create a dedicated UniFi OS local user (not your UI account).
2. Note the username and password.
3. Add the following to your Homebridge `config.json`:

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
- For UniFi devices like UDM or UDR, omit the port (e.g., `"192.168.1.1"`).

## Optional Configuration

### Specify UniFi Site(s)

```json
{
  "sites": ["Default", "mySite"]
}
```

- You may specify site `desc` values (friendly names like `"Default"`, `"mySite"`) or internal names (`"default"`, `"p2yvd0iv"`).
- The plugin automatically resolves the proper internal identifiers using the UniFi API.

### Include / Exclude Specific Devices

```json
{
  "includeIds": ["<device-id-1>", "<device-id-2>"],
  "excludeIds": ["<device-id-3>"]
}
```

- `includeIds`: Only devices with these IDs will be shown in HomeKit.
- `excludeIds`: Devices with these IDs will always be excluded, even if included elsewhere.

### Device Cache Refresh
- The plugin refreshes its device cache every 10 minutes by default. You can change this interval with the `refreshIntervalMinutes` config option:

```json
{
  "refreshIntervalMinutes": 5
}
```
*Set the device cache refresh interval to 5 minutes (default is 10).*

- If the controller is unreachable during a refresh, the plugin logs an error and retries at the next interval.

## Debugging Tips

- Run Homebridge in debug mode (`homebridge -D`) to view detailed logs.
- On startup, the plugin will list all detected sites:
  ```
  [UniFi AP Lights] Available sites loaded: Default, default, mySite, p2yvd0iv
  ```
- If a site is not recognized, you'll see:
  ```
  Site "xyz" is not recognized by the controller (api.err.NoSiteContext).
  ```

## Troubleshooting / FAQ

- **Authentication fails:**
  - Make sure you are using a UniFi OS local user, not a UI.com account.
  - Double-check your username and password.
- **Site not recognized:**
  - Check the spelling and case of your site name.
  - Use the internal site name if the friendly name does not work.
- **No devices found:**
  - Ensure your user has permission to view devices in the UniFi controller.
  - Check network connectivity between Homebridge and the UniFi controller.

## HomeKit "Not Responding" Behavior

If the UniFi controller is unreachable (due to network issues, authentication errors, or API failures), HomeKit will show your UniFi AP Light accessories as "Not Responding." This is intentional: the plugin will mark the accessory as unavailable in HomeKit until communication with the controller is restored. Once the controller is reachable again, the accessory will automatically resume normal operation.

- You may see a "Not Responding" message in the Home app if the controller is offline or credentials are invalid.
- All error handling is robustly tested to ensure HomeKit accurately reflects the accessory's status.

## Quality

This plugin is fully covered by automated tests and maintains high code coverage.

## License
This project is licensed under the Apache 2.0 License — see the [LICENSE](LICENSE) file for details.
