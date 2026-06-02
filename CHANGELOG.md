# Changelog

All notable changes to this project will be documented in this file.

## v1.1.0 - Web UI Portal Support

- Added custom app Web UI URL management.
- Added backend APIs for saving and removing custom app Web UI portal mappings.
- Added metadata patching for `<app-name>.portals.Web UI`.
- Added a dashboard editor for setting the TrueNAS Web UI button URL on custom apps.
- Preserved icon mappings when removing Web UI mappings, and preserved Web UI mappings when removing icon mappings.
- Added tests for Web UI portal metadata patching.

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
