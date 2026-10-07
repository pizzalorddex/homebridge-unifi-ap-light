# Changelog

All notable changes to this project will be documented in this file.

## [1.5.1-beta.1] - 2026-10-07

- Recover discovery and cached HomeKit controls when the controller is unavailable at startup.
- Share refresh work across scheduled checks and concurrent recovery requests.
- Report failed LED writes to HomeKit and preserve fresh device data after a write.
- Resolve inherited LED state through the site's LED setting.
- Retry rate-limited logins once and distinguish controller outages from endpoint detection errors.
- Keep login request credentials out of authentication error logs.
- Add optional HTTPS certificate verification and a private CA file setting.

## [1.5.0] - 2026-10-07

### Changed

- Released the multi-site discovery, device filters, and connection recovery
  improvements from the 1.5 beta series.
- Supports Homebridge 1 and 2 on Node.js 22 and 24.
- Updated dependencies and checked installation from the published package.

### Fixed

- Retries site discovery when UniFi Network is still starting.
- Leaves the platform idle when required configuration is missing, instead of
  stopping the bridge.
- Catches startup and refresh errors and stops the refresh timer on shutdown.

### Upgrade

Existing platform configuration and HomeKit accessory identities are preserved.
Node.js 18 and 20 are no longer supported; update Node.js before installing.

## [1.5.0-beta.2] - 2026-09-10

### Fixed

- Kept configured sites and access point filters active during recovery.

### Changed

- Updated the supported Homebridge and Node.js releases.
- Tightened controller routing and the build, test, and package checks.

## [1.5.0-beta.1] - 2025-05-22

### Changed

- Added multi-site discovery and include/exclude filters.
- Added recovery locking and repeated-error suppression.
- Moved tests to Vitest and added coverage for discovery, recovery, and API
  routing.
- Added a Docker Compose development environment.
- Updated the package for Homebridge 2 and supported Node.js releases.

## [1.4.5] - 2025-05-14

### Fixed

- Preserved cached accessories created before site information was stored.

## [1.4.4] - 2025-05-14

### Added

- Multi-site support for UniFi OS and self-hosted controllers.
- Device discovery filters.
