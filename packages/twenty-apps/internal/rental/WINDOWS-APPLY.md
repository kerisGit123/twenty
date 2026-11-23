# Putting the rental app on the live server from Windows

Written 2026-11-23 after restoring the app. The source of truth is this folder on GitHub (`main`).
Always apply from a fresh clone of `main`: the live app's code is whatever was last applied, and an
old copy would overwrite newer features.

## Steps

1. Get the code and install (Node 24):
   `git clone https://github.com/kerisGit123/twenty.git`, open `packages/twenty-apps/internal/rental`, run `npm install`
   (or `yarn install`; the repo's own yarn patch only covers part of the path problem).
2. Fix the Windows paths in the SDK: `node scripts/patch-twenty-sdk-windows.cjs`.
   Without it, apply stops with "Resource path must not contain backslashes".
3. Add the live server as a remote in `%USERPROFILE%\.twenty\config.json`
   (copy the existing remote, change `apiUrl` to the Railway address). The API key is the one already in that file.
   Put the config back afterwards.
4. Preview first, nothing is changed: `npx twenty plan --no-delete -r <remote>`.
   Expect "0 to destroy". If it lists deletes, stop.
5. Apply: `npx twenty apply --no-delete -r <remote>`.

## Things to know

- `--no-delete` keeps anything on the server that is missing from your folder. Use it every time.
- The server restarts during the sync: expect `502 Bad Gateway` from the command and about a minute of 502 for
  everyone. The change is normally already in. Wait for `/healthz` to answer 200 before testing.
- Do it when the shop is quiet, and hard-reload the page (Ctrl+Shift+R) afterwards.
- The server cannot give the app's code back (the export is empty), so GitHub is the only copy. Commit and push every change.
- To change only a few pages, copy the folder, delete the other `*.front-component.tsx` entries, the
  `command-menu-items` and the logic functions you do not touch, and apply that copy with `--no-delete`.
  The plan then shows only the pieces you meant to change.
