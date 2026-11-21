# Work Layer

A standalone, mobile-first workspace for capturing thoughts, saving useful links, and grouping them into spaces.

## What changed

The original dashboard had a polished visual concept, but its primary navigation, search, create-space flow, and several capture actions were only placeholders. It also showed sample workspace content and a “synced” status despite having no persistence layer. The rebuild keeps Layer’s capture-and-organize purpose while replacing the nonfunctional controls with working local workflows and honest storage messaging.

- Quick capture saves a note or recognizes a pasted HTTP(S) URL as a link.
- Spaces group notes and links; deleting a space moves its captures back to the inbox.
- Inbox, Notes, Links, Spaces, and Home have distinct working views.
- Search checks saved item text, URLs, tags, and space names; `Ctrl/Cmd + K` opens it.
- Saved notes and links can be edited, moved between Inbox and Spaces, tagged, or copied to the clipboard.
- Quick capture and item editing support up to four compressed image attachments per item; tags can filter lists.
- Item details show attached images and provide quick copy, edit, open-link, and delete actions.
- A JSON backup can be downloaded from the navigation panel.
- Each visitor can optionally set a display name from their profile control; no owner name is prefilled.
- The responsive interface keeps its warm paper palette, rust and olive accents, compact mobile tab bar, and drawer for full navigation.
- PWA title, icon, manifest colors, and offline cache version were updated to match.

## Storage and privacy

Workspace data, including the optional display name, tags, and compressed image attachments, is stored in this browser's `localStorage`; it is not sent to a server or synced to another device. Image attachments share a bounded local storage budget, and backups include the saved item data. Clearing browser site data can remove it, so use **Download a backup** to keep a JSON copy. This build intentionally adds no account, cloud service, or analytics connection.

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
