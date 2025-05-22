# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0-beta.1] - 2025-05-22

### What's Changed
- **Error Handling & Logging:**
  - Centralized error handling and improved log message clarity
  - Unified error routing and offline/online state management
  - Reduced log spam (e.g., session expired logs now debug)
  - Robust error log suppression and throttling for both error and info logs
- **Recovery Logic:**
  - Added concurrency lock to prevent overlapping recovery attempts
  - Improved recovery manager and cache refresh logic
  - Added tests for recovery and log suppression
- **Testing & CI:**
  - Started using Vitest for testing
  - Added tests for error handling, recovery, and platform logic
  - Added GitHub Actions CI for build, lint, and test on Node 20/22
- **Docker & Local Dev:**
  - Added Docker Compose environment for local Homebridge testing
  - Updated ignore files to exclude dev/test artifacts from npm and git
- **Refactoring & Structure:**
  - Modularized and modernized platform logic
  - Improved code structure, type safety, and maintainability
  - Updated config schema and documentation

## [1.4.5] - 2025-05-14

### What's Changed
- Patch: Add migration fallback for missing site property in cached accessories
- Ensures restored accessories from cache work correctly after multi-site support
- No longer logs "missing site information" errors for affected users

## [1.4.4] - 2025-05-14

### What's Changed
- Add multi-site support for UniFi OS and self-hosted controllers
- Improved device discovery and filtering
- Enhanced debug logging and error handling
