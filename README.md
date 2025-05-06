# homebridge-unifi-ap-light
Control the light rings on your UniFi Access Point(s) with HomeKit!

## Features
- **Multi-Site Support:** Supports multiple UniFi sites (tenants) in a single Homebridge config.
- **Dynamic Discovery:** Automatically discovers UniFi APs across one or more specified sites.
- **Real-time Updates:** Changes made in HomeKit instantly reflect on your access points.
- **Advanced Filtering:** Include or exclude specific APs by ID.
- **Compatiblity:** Supports self-hosted and Ubiquiti-hosted (e.g. UDM) UniFi API structures.
- **Session Management:** Robust handling of cookie- and token-based API authentication.

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

## License
This project is licensed under the MIT License — see the LICENSE file for details.
