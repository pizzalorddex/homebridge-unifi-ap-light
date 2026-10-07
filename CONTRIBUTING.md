# Contributing

Bug fixes and compatibility reports are welcome. Please open an issue before
starting a large change so the scope is clear.

## Local checks

Install the dependencies and run the same checks used by CI:

```sh
npm ci
npm run verify
npm run check:package
```

Use `npm run test:watch` while working on tests and `npm run watch` while
working on TypeScript code.

Keep changes focused. Add a test when behavior changes, and update the changelog
for changes users will notice.

## Controller testing

Unit tests use fake controller responses and do not need network access. Tests
against a real controller should use a dedicated local account with only the
permissions the plugin needs.

Never commit controller addresses, usernames, passwords, cookies, tokens,
device IDs, configuration files, database exports, or unedited logs. Include
the Homebridge, Node.js, UniFi Network, and AP firmware versions when reporting
a compatibility result.

The isolated Docker environment is documented in [docker/README.md](docker/README.md).
