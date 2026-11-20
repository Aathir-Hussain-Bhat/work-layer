# Work Layer

A standalone, mobile-first workspace for capturing thoughts, saving useful links, and grouping them into spaces.

## What changed

The original dashboard had a polished visual concept, but its primary navigation, search, create-space flow, and several capture actions were only placeholders. It also showed sample workspace content and a “synced” status despite having no persistence layer. The rebuild keeps Layer’s capture-and-organize purpose while replacing the nonfunctional controls with working local workflows and honest storage messaging.

- Quick capture saves a note or recognizes a pasted HTTP(S) URL as a link.
- Spaces group notes and links; deleting a space moves its captures back to the inbox.
- Inbox, Notes, Links, Spaces, and Home have distinct working views.
- Search checks saved item text, URLs, and space names; `Ctrl/Cmd + K` opens it.
- Item details can open saved links or remove an item.
- A JSON backup can be downloaded from the navigation panel.
- The responsive interface uses dark navy and gold accents, with a compact mobile tab bar and a drawer for the full navigation.
- PWA title, icon, manifest colors, and offline cache version were updated to match.

## Storage and privacy

Workspace data is stored in this browser's `localStorage`; it is not sent to a server or synced to another device. Clearing browser site data can remove it, so use **Download a backup** to keep a JSON copy. This build intentionally adds no account, cloud service, or analytics connection.

## Run locally

Requires Node.js and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The dev server serves the client on port 3000 (or the next available port). Verify the project with:

```bash
pnpm check
pnpm build
```

## Public site

The app is deployed from the `main` branch with GitHub Actions to [the Layer public site](https://aathir-hussain-bhat.github.io/work-layer/). Each visitor's workspace remains in that visitor's own browser storage; publishing the app does not publish their saved notes or links.
