# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open-source release

### Fixed
- Mobile layout when embedded in an iframe: dropped `100vh` and `vh`-based textarea heights in embed mode (iOS Safari reports `vh` against the device viewport, not the iframe), tightened the compact header on narrow screens, and lowered `body` min-width so narrow iframes don't horizontally overflow.
