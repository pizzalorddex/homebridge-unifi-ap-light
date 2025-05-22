# Homebridge Docker Test Environment

This Docker Compose setup runs the latest Homebridge and the Homebridge Config UI X web interface for local development and testing.

## Quick Start

1. **Copy the Example Config:**
   ```sh
   cp config/config.example.json config/config.json
   ```
   - Edit `config/config.json` with your UniFi and Homebridge settings.
   - Only `config.example.json` is tracked by git; your personal `config.json` will never be committed.

2. **Start Homebridge:**
   ```sh
   cd docker
   docker compose up -d
   ```

3. **Access the Web UI:**  
   Open [http://localhost:8581](http://localhost:8581) in your browser.

4. **Stop Homebridge:**
   ```sh
   docker compose down
   ```

## Data & Configuration

- The `config` folder is mounted as `/homebridge` in the container. All Homebridge data (config, accessories, persist, etc.) is stored here.

## Notes

- Default UI login: `admin` / `admin` (unless changed in the UI).
- To update Homebridge, change the `image:` tag in `docker-compose.yml`.
- To test your plugin, copy or symlink your built plugin files into the `config` folder, or install via the UI.
