
Repo URL locked in: **https://github.com/ladelpriore/CampusConnect-AI-CRM**

## Changes I'll make

1. **`src/lib/campus.ts`** — export a `GITHUB_REPO_URL` constant so every link uses one source of truth.

2. **`src/routes/_authenticated/route.tsx`** — add a **"View source on GitHub"** row in the sidebar footer, above the "Signed in as / Sign out" block. GitHub icon from `lucide-react`, `target="_blank"`, `rel="noopener noreferrer"`.

3. **`src/routes/_authenticated/dashboard.tsx`** — extend the Guided Demo panel with a final step **"7. View the source code"** linking to the repo, so a recruiter who follows the walkthrough lands on the code. Uses the same numbered-card styling as the existing 6 steps but with an external-link icon.

4. **`src/routes/auth.tsx`** — add a small "View source on GitHub" link under the "Continue as demo user" button so visitors who don't sign in can still reach the repo.

5. **`README.md`** — add a short header block at the top:
   - Live demo: https://campuscontext-core.lovable.app
   - Source: https://github.com/ladelpriore/CampusConnect-AI-CRM

## What I won't touch

Schema, auth, business logic, existing enterprise design, sidebar structure, seed data, workflows, or the guided demo's existing 6 steps.

## Verification

After edits: `tsgo --noEmit` for typecheck, then a quick preview screenshot pass on `/auth` and `/dashboard` to confirm the links render and open in a new tab.
