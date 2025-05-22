# Homebridge v2 Docker Test Environment

This Docker Compose setup will run the latest Homebridge and the Homebridge Config UI X web interface. It is designed for local development and testing.

## Usage

1. **Build and start the environment:**
   ```sh
   cd docker
   docker compose up -d
   ```

2. **Access Homebridge UI:**
   - Open your browser and go to: [http://localhost:8581](http://localhost:8581)
   - (If you mapped the UI to a different port, use that port.)

3. **Homebridge Data:**
   - The `config` folder in this directory is mounted as `/homebridge` in the container. Your Homebridge config, accessories, and persist data will be stored here.

4. **Stopping the environment:**
   ```sh
   docker compose down
   ```

## Notes
- The default username is `admin` and the default password is `admin` (unless you change it in the UI).
- You can update the Homebridge version by editing the `image:` tag in `docker-compose.yml`.
- To test your plugin, copy or symlink your built plugin files into the `config` folder, or install via the UI.
