# homebridge-unifi-ap-light
Control the light rings on your UniFi Access Point(s) with HomeKit!

## Features
- **Dynamic Discovery:** Automatically discovers all UniFi APs on your network.
- **Real-time Updates:** Changes made through HomeKit are reflected immediately on your devices.
- **Advanced Configuration:** Supports detailed configuration for filtering APs to display in the Home app.
- **Backwards Compatible:** Supports both older and newer UniFi APIs for better compatibility.
- **API Session Manager:** Ensures the connection to the API doesn't break down due to cookie/token changes.

## Installation
Search for `homebridge-unifi-ap-light`, or run:
```sh
yarn global add homebridge-unifi-ap-light
```

## Usage
Create a local UniFi OS user, take note of the username and password.
Add the following to your `config.json`:
```json
{
  "name": "UniFi AP Lights",
  "platform": "UnifiAPLight",
  "host": "<hostname>:<port>",
  "username": "<username>",
  "password": "<password>"
}
```
## Optional Configuration
You can control which access points are exposed to HomeKit using include / exclude IDs options:
```json
{
  "password": "<password>",
  "includeIds": ["<id1>", "<id2>"],
  "excludeIds": ["<id3>"]
}
```

- `includeIds`: Only the devices with IDs listed will be included. If not specified, all devices are included by default.
- `excludeIds`: Any device with an ID in this list will be excluded from HomeKit, regardless of other settings.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
