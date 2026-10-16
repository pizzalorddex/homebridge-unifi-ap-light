# UniFi Access Point Light for Homebridge

[![CI](https://github.com/pizzalorddex/homebridge-unifi-ap-light/actions/workflows/build.yml/badge.svg)](https://github.com/pizzalorddex/homebridge-unifi-ap-light/actions/workflows/build.yml)
[![npm](https://img.shields.io/npm/v/homebridge-unifi-ap-light)](https://www.npmjs.com/package/homebridge-unifi-ap-light)

This Homebridge plugin exposes the light ring on each supported UniFi access
point in Apple Home, with on/off controls and optional brightness and colour controls. It can discover APs across multiple sites and can include or
exclude individual devices.

## Requirements

- Node.js 22.12 or later in the Node 22 line, or Node.js 24
- Homebridge 1.8 or later, including Homebridge 2
- A local UniFi account with permission to read and update network devices

## Compatibility

Tested with Homebridge 1.11.4 and 2.4.0 on Node.js 22 and 24, legacy UniFi
Network Server, and UniFi OS Server on ARM64. See the
[compatibility notes](docs/COMPATIBILITY.md) for controller versions and test scope.

The plugin uses local UniFi endpoints that are not a documented public API for
AP light control. Check compatibility after UniFi Network updates.

## Install

Find `homebridge-unifi-ap-light` in the Homebridge UI, or install it with npm:

```sh
npm install -g homebridge-unifi-ap-light
```

## Configure

The Homebridge UI provides a configuration form. A minimal configuration is:

```json
{
  "name": "UniFi AP Lights",
  "platform": "UnifiAPLight",
  "host": "192.168.1.10:8443",
  "username": "homebridge",
  "password": "replace-with-the-local-account-password"
}
```

Use a dedicated local UniFi account instead of a UI.com account. Include the
port used by a self-hosted Network Server. A UniFi console normally uses its
standard HTTPS port and does not need a port in `host`.

Optional settings:

```json
{
  "sites": ["default"],
  "includeIds": ["device-id-to-include"],
  "excludeIds": ["device-id-to-exclude"],
  "refreshIntervalMinutes": 10
}
```

- `sites` limits discovery to the named sites. The default site is used when
  the list is empty.
- `includeIds` limits HomeKit accessories to the listed UniFi device IDs.
- `excludeIds` removes listed devices, including devices also present in
  `includeIds`.
- `refreshIntervalMinutes` controls device-cache refreshes and defaults to 10.

### HTTPS certificates

For a controller with a publicly trusted certificate, set `"verifySsl": true`.
For a private CA, also set `"caFile"` to its PEM certificate path on the
Homebridge host. Setting `caFile` enables verification unless `verifySsl` is
explicitly false. In Docker, mount the certificate and use its container path.

Existing configurations continue to accept self-signed certificates. In that
mode HTTPS encrypts traffic but does not verify the controller's identity.

## Brightness controls

In a prerelease containing brightness-only support, enable **Enable brightness
controls** in the plugin settings and restart its child bridge. In JSON, use
`"enableBrightness": true`. The setting defaults to false.

U7 Pro (`U7PRO`) and APs reporting RGB LED-ring hardware get a brightness slider
on their existing light accessory in Apple Home. U7 Pro does not get colour
controls. Other models keep on/off controls until their dimming support is
confirmed; saved brightness values alone do not establish support.

Use the standard Home controls to dim the light or save a brightness level in
a scene or automation. The plugin does not run its own lighting schedule.
Brightness changes preserve colour and on/off state; switching the light off
preserves its brightness level. Changes made directly in UniFi appear after
the next device-cache refresh.

U7 Pro dimming has been tested through the controller API on physical hardware.
See the [compatibility notes](docs/COMPATIBILITY.md) for versions and test scope.

## Experimental RGB controls

RGB prereleases add Apple's standard colour and brightness controls to the
existing light accessory. No custom Homebridge colour picker is needed.

After installing an RGB prerelease, enable **Enable RGB controls** in the
plugin settings and restart its child bridge. In JSON, use `"enableRgb": true`.
The setting defaults to false.

The AP must report LED-ring support through its hardware capabilities.
Saved colour fields alone do not enable RGB. APs without that capability,
including U7 Pro devices, do not get colour controls. Their brightness setting
is separate.
Capabilities come from normal discovery; there are no extra capability API
requests. Firmware or capability changes are picked up during normal refreshes.

RGB hardware behavior is awaiting owner confirmation. See
[compatibility notes](docs/COMPATIBILITY.md) before trying it. Include the
plugin, AP firmware, controller and Homebridge versions when reporting results;
remove identifying data from logs.

To return to stable, disable **Enable RGB controls** and **Enable brightness
controls**, then restart the child bridge first. This removes the optional characteristics without changing
accessory identity. Then use **Manage Version** to install the stable version.


## Troubleshooting

- Authentication errors usually mean the account is a UI.com account, the
  local account lacks device permissions, or the host and port are wrong.
- If a site is not found, enable Homebridge debug logging and use the internal
  site name reported by the controller.
- If no APs are found, check the account permissions and connectivity from the
  Homebridge host to the controller.
- When a controller restarts or updates, the plugin reports the connection
  failure and retries. Accessories recover after the controller is available.

Do not post passwords, cookies, tokens, controller addresses, or complete debug
logs in a public issue. Remove device IDs and other identifying data first.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local development workflow and
guidelines for testing against a controller.

```sh
npm ci
npm run verify
npm run check:package
```

`npm run verify` runs lint, the TypeScript build, and the test suite. `npm run check:package` builds a tarball, checks its
contents, and installs and loads it in a temporary directory. The tests
cover routing, authentication responses, discovery, filtering, cached state,
HomeKit behavior, error handling, and recovery. Controller and AP compatibility
still requires a test against those versions.

The optional Docker setup is described in [docker/README.md](docker/README.md).

Bug reports and compatibility results are welcome through the repository's
[issue templates](https://github.com/pizzalorddex/homebridge-unifi-ap-light/issues/new/choose).

## License

Apache-2.0. See [LICENSE](LICENSE).
