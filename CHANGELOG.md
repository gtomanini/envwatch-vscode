# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Multi-root workspaces: scanning one folder no longer clears diagnostics from the others, and the sidebar shows results from all folders.
- Saving `.js`, `.ts`, `.mjs`, `.cjs`, `.jsx` and `.tsx` files now triggers a rescan.

### Changed
- Declared support for untrusted workspaces (the extension only reads files).

## [0.1.0]

### Added
- Initial release with detectors for Laravel, Symfony, Node.js and Spring Boot.
- Inline diagnostics, sidebar panel and automatic rescanning.
