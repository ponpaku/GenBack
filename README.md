# GenBack

**Generation-managed Robocopy Backup Tool for Windows**

GenBack is a desktop backup application for Windows that provides generation-managed backups using Robocopy. It supports NAS (network-attached storage) targets, scheduled execution, Discord notifications, and a headless CLI mode for automation.

## Features

- **Generation management** — Automatically rotates old backups, keeping a configurable number of generations
- **NAS / network drive support** — Mounts network shares via `net use` before backup and unmounts afterward
- **Robocopy integration** — Leverages Windows' built-in Robocopy for fast, reliable mirroring
- **Trash box** — Moves deleted files to a trash folder instead of permanently removing them
- **Scheduler** — Registers Windows Task Scheduler jobs (`schtasks`) for daily/weekly automation
- **Discord notifications** — Sends backup start/finish/error notifications via Discord webhook
- **Headless CLI mode** — Run `genback.exe --headless <profile>` from the scheduler or scripts without a GUI
- **Multi-profile** — Manage multiple independent backup profiles from a single application
- **Dark / Light theme** — Toggle between dark and light UI themes

## Requirements

- **OS**: Windows 10 / Windows 11 (64-bit)
- **Rust**: 1.70 or later (for building from source)
- **Node.js**: 18 or later (for building the frontend)
- **Robocopy**: Included with Windows (no additional installation needed)

## Build from Source

```bash
# 1. Install dependencies
npm install

# 2. Build the application (frontend + Tauri/Rust backend)
npm run tauri build
```

The compiled installer will be placed in `src-tauri/target/release/bundle/`.

For development with hot-reload:

```bash
npm run tauri dev
```

## Configuration

Backup profiles are stored as TOML files in:

```
%USERPROFILE%\.genback\profiles\
```

Each profile contains source/destination paths, generation count, network drive credentials, notification settings, and schedule configuration. Profiles can be created and edited through the GUI Settings page.

## Headless / CLI Mode

To run a backup without the GUI (e.g., from Windows Task Scheduler):

```
genback.exe --headless <profile-name>
```

Logs are written to `src-tauri/` alongside the executable by default.

## License

TBD
