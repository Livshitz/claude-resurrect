# Releasing

Publishing is automated via GitHub Actions (`.github/workflows/publish.yml`) — there is no manual `npm publish`.

## One-time setup

1. Create an **npm automation token** (npmjs.com → Access Tokens → Generate → *Automation*).
2. Add it as a repo secret named `NPM_TOKEN`:
   ```bash
   gh secret set NPM_TOKEN --repo Livshitz/claude-resurrect
   ```
   (npm provenance also requires the repo to be **public** + the package public.)

## Cut a release

1. Bump `version` in `package.json` (semver) and commit.
2. Tag + release — the tag must match the version:
   ```bash
   gh release create v0.1.0 --title v0.1.0 --generate-notes
   ```
3. The `publish` workflow builds (`tsc`) and runs `npm publish --provenance --access public`.

`workflow_dispatch` is also enabled, so you can re-run a publish manually from the Actions tab if needed.
