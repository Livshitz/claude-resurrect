# Releasing

Publishing is automated via GitHub Actions (`.github/workflows/publish.yml`) — there is no manual `npm publish`.

The npm token is **not** a per-repo secret — CI pulls it at publish time from **bodify's secrets store** (`NPM_TOKEN`, app-scoped). The only GitHub secret is `BODIFY_API_KEY`.

## One-time setup

```bash
gh secret set BODIFY_API_KEY --repo Livshitz/claude-resurrect   # the bodify access key
```
(`NPM_TOKEN` already lives in bodify; rotate it there, never here. npm provenance also needs the repo + package public.)

## Cut a release

1. Bump `version` in `package.json` (semver) and commit.
2. Tag + release — the tag must match the version:
   ```bash
   gh release create v0.1.0 --title v0.1.0 --generate-notes
   ```
3. The `publish` workflow builds (`tsc`) and runs `npm publish --provenance --access public`.

`workflow_dispatch` is also enabled, so you can re-run a publish manually from the Actions tab if needed.
