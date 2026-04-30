# Changelog

All notable changes to this project will be documented in this file.

## v1.0.0 - Initial Public Release

- Added the first public release of TrueNAS App Icon Manager.
- Added a React dashboard for viewing TrueNAS SCALE apps and managing custom icons.
- Added backend APIs for apps, mappings, logs, health checks, reapply actions, and Dashboard Icons suggestions.
- Added persistent icon mapping storage in `/config/icon-mappings.json`.
- Added conservative patching for `/ix-apps/metadata.yaml` at `<app-name>.metadata.icon`.
- Added timestamped metadata backups before writes.
- Added startup reapply and 30-second background polling to restore managed icons after TrueNAS regenerates metadata.
- Added PNG, SVG, JPEG, and WebP uploads with 512 KB validation and base64 data URI conversion.
- Added Dashboard Icons search and one-click use support.
- Added light and dark mode.
- Added Dockerfile and TrueNAS custom app compose example.
- Added MIT license, funding metadata, tests, and release documentation.
