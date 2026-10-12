# Compatibility

The on/off functionality is tested with these versions:

| Component | Version | Tested behavior |
| --- | --- | --- |
| Node.js | 22 and 24 | Install, build, and tests |
| Homebridge | 1.11.4 and 2.4.0 | Plugin loading and accessory behavior |
| UniFi Network Server | 10.6.101 | Login, site and AP discovery, state reads, and LED control |
| UniFi OS Server | 5.1.42 on ARM64, Network 10.6.101 | Login, discovery, LED read, and an unchanged-value LED write on a physical AP |

UniFi OS Server 5.1.42 with Network 10.6.106 also passed physical-AP discovery,
LED reads, and an unchanged-value LED write with the reliability patch in
1.5.1. The automated write check sends the current LED value, so it does
not toggle the light.

## RGB prerelease scope

The RGB controls have automated HomeKit, request-routing, conversion, batching
and failure tests. Physical E7 colour and brightness behavior has not yet been
verified for this prerelease. The controller capability flag is used by other
UniFi integrations; it is not a guarantee for every model or firmware version.

RGB requires an explicit `enableRgb` opt-in and a supported AP capability.
The same local device update endpoint carries `led_override_color` and
`led_override_color_brightness`. Hardware acceptance includes physical colour
and brightness changes, not only a successful HTTP response or saved setting.

The E7 request captures and hardware reports in
[issue #7](https://github.com/pizzalorddex/homebridge-unifi-ap-light/issues/7)
provided the protocol evidence for this feature.

## UniFi API use

For a self-hosted Network Server, the plugin reads APs from
`/api/s/{site}/stat/device` and updates `led_override` through
`/api/s/{site}/rest/device/{id}`.

On UniFi OS, the same Network endpoints are reached below
`/proxy/network/api`. Login uses `/api/auth/login` with the returned cookie and
CSRF token.

These are local UniFi endpoints and are not a documented public contract for
AP light control. Check compatibility again after a UniFi Network update.

## Compatibility reports

When reporting a problem, include the plugin, Homebridge, Node.js, UniFi
Network, and AP model versions. Remove controller addresses, device IDs,
usernames, tokens, cookies, and other identifying details from logs.
