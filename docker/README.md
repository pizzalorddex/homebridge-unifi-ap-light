# Docker test environment

This Compose file runs a separate Homebridge instance for manual plugin tests.
It keeps its configuration under `docker/config`, away from a normal Homebridge
installation.

## Build and start

Run these commands from the repository root:

```sh
npm ci
npm run verify
PLUGIN_PACKAGE=$(npm pack --silent)
cp docker/config/config.example.json docker/config/config.json
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml cp "$PLUGIN_PACKAGE" homebridge:/tmp/plugin.tgz
docker compose -f docker/docker-compose.yml exec homebridge npm install -g /tmp/plugin.tgz
docker compose -f docker/docker-compose.yml restart homebridge
rm "$PLUGIN_PACKAGE"
```

Open <http://localhost:8581>. The example configuration uses `admin` / `admin`
for the Homebridge UI. Change it if another person can reach the test instance.

Add the plugin configuration through the UI. Use a dedicated local UniFi
account and test controller when possible. Files created under `docker/config`
are ignored by Git.

Follow the logs with:

```sh
docker compose -f docker/docker-compose.yml logs -f homebridge
```

## Stop and remove it

```sh
docker compose -f docker/docker-compose.yml down
```

The Compose file currently follows the `homebridge/homebridge:latest` image.
Use a fixed image tag when reproducing a version-specific problem.
