# Sync CampusContext to GitHub

## Goal
Connect the Lovable editor to the existing GitHub repository `https://github.com/ladelpriore/CampusConnect-AI-CRM.git` so the prototype code is synced, and make sure the demo dashboard points recruiters to that repo.

## What you need to do in the Lovable editor

1. Open the editor for this CampusContext project.
2. Click the **Plus (+)** button in the chat input (bottom-left).
3. Choose **GitHub → Connect project**.
4. Authorize the Lovable GitHub App when prompted.
5. Select your GitHub account/organization.
6. Choose **Use an existing repository** and enter/pick `CampusConnect-AI-CRM`.
   - If Lovable only shows “Create repository,” create a new one and later rename or transfer it to match the existing repo, or open the existing repo settings and point it to the new Lovable-generated repo.
7. Click **Connect** / **Sync**. Lovable will push the current project files and enable two-way sync.

## What I will do after you connect

1. Verify all GitHub links in the codebase point to the correct repository:
   - `src/routes/_authenticated/route.tsx` (sidebar footer)
   - `src/routes/_authenticated/dashboard.tsx` (Guided Demo panel step 7)
   - `src/routes/auth.tsx` (auth page footer)
   - `README.md` (repo badge and link)
2. Update any links that still reference the old placeholder or a different URL.
3. Confirm the dashboard still shows the **Continue as demo user** flow and the GitHub link opens the repo in a new tab.
4. Run a type-check to make sure the link changes don’t break the build.

## Outcome

Recruiters using the public demo can click through the dashboard, see the GitHub link in the Guided Demo panel/sidebar, and view the actual source code and project structure.

## Next step

Go ahead and connect GitHub in the editor, then reply here once it’s done. I’ll immediately verify and update the in-app links.