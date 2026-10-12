# UniFi Access Point Light for Homebridge

[![CI](https://github.com/pizzalorddex/homebridge-unifi-ap-light/actions/workflows/build.yml/badge.svg)](https://github.com/pizzalorddex/homebridge-unifi-ap-light/actions/workflows/build.yml)
[![npm](https://img.shields.io/npm/v/homebridge-unifi-ap-light)](https://www.npmjs.com/package/homebridge-unifi-ap-light)

This Homebridge plugin creates a switch for the light ring on each supported
UniFi access point. It can discover APs across multiple sites and can include or
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
