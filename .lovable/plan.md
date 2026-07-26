# Sync CampusContext to GitHub

## Goal
Connect the Lovable editor to the GitHub repository `https://github.com/ladelpriore/CampusConnect---Data-Platform-.git` so the prototype code is synced, and make sure the demo dashboard points recruiters to that repo.

## Status

Connected successfully. The repo name in GitHub is `CampusConnect---Data-Platform-`.

## Verified in-app links

- `src/lib/campus.ts` — `GITHUB_REPO_URL` points to the synced repo.
- `src/routes/_authenticated/route.tsx` — sidebar footer uses the constant.
- `src/routes/_authenticated/dashboard.tsx` — Guided Demo panel step 7 uses the constant.
- `src/routes/auth.tsx` — auth page footer uses the constant.
- `README.md` — source link updated to the synced repo.

## Outcome

Recruiters using the public demo can click through the dashboard, see the GitHub link in the Guided Demo panel/sidebar, and view the actual source code and project structure.

## Next step

Open the published demo, click **Continue as demo user**, and verify that the GitHub links in the sidebar and Guided Demo panel open the correct repository in a new tab.