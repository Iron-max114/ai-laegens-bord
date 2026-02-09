# Setup Log

## Playwright CLI Installation

- Installed Playwright CLI globally via `npm install -g @playwright/cli`
- Version installed: 1.58.2
- Decision: Use system Chrome instead of Playwright's bundled Chromium
  - Set `channel: 'chrome'` in code or use `--channel chrome` from CLI
  - No need to run `npx playwright install` for browser binaries
