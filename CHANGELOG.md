# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open-source release
- `postMessage` height handshake in embed mode: the app posts `{ type: "prismia:resize", height }` to `window.parent` whenever its content height changes, so host pages can auto-resize the iframe instead of locking it to a broken aspect-ratio box. README documents the host-side listener snippet.

### Fixed
- Mobile layout when embedded in an iframe: dropped `100vh` and `vh`-based textarea heights in embed mode (iOS Safari reports `vh` against the device viewport, not the iframe), tightened the compact header on narrow screens, and lowered `body` min-width so narrow iframes don't horizontally overflow.
