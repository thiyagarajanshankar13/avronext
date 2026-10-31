# AvroNext

A modern, Jira/Confluence-style front end for **Nextcloud**.

- **Projects** (Jira-like) on top of **Nextcloud Deck**: boards with drag-and-drop columns, a sortable list view, issue keys (`ML-42`), an issue panel with Markdown descriptions, assignees, labels, due dates, done state and comments.
- **Spaces** (Confluence-like) on top of **Nextcloud Collectives**: a page tree, rendered pages with a table of contents and info/warning panels, a WYSIWYG editor (toolbar, `/` commands, tables, info/warning panels, task lists, links, pasted and dropped images) with a Markdown mode one click away, child pages, page icons, and trash. Issue descriptions use the same editor.
- **Attachments** on issues and pages: attach button, drag-and-drop onto the issue/page, or paste a screenshot. Thumbnails for images, upload progress, download and delete. In the page editor, attached images and files are inserted into the text at the cursor.
- **People and permissions**: project settings › People (Viewer / Member / Admin for users, groups and Nextcloud teams, on top of Deck sharing) and space settings (Member / Moderator / Admin, who may edit and share pages, icon, trash; on top of the collective's team).
- **Administration** (Nextcloud admins and group admins): users (add with an emailed invite or a password, edit, groups, group-admin rights, admin rights, quota, disable, reset password, resend invite, delete) and groups (create, rename, delete). Nextcloud enforces every permission; group admins only see their groups.
- **Files** (OneDrive-like) on top of **Nextcloud Files**: My files, Recent, Favourites, Shared with me / by me; list and tile views; drag-and-drop upload of files and whole folders (chunked, so big files work); download (zip for several items), rename, move/copy, delete; sharing with people, groups and teams or by public link (password, expiry). A read-only viewer for images, PDF, video/audio, text/Markdown, Word, Excel and PowerPoint, all in the browser (no Nextcloud Office needed).
- **Light / Dark / System theme**, remembered per browser.
- **Your work**: issues assigned to you, issues due this week, recently updated pages and issues.
- **Search** across issue titles/descriptions, page titles and page content.

AvroNext has **no database and no storage of its own**. Everything is read from and written to Nextcloud, so you can keep using Deck and Collectives in Nextcloud side by side.

## Requirements

- Nextcloud 28+ with the **Deck** and **Collectives** apps enabled. (Collectives also needs Teams/Circles, which ships with Nextcloud.) If one of the apps is missing, that half of AvroNext shows a friendly notice and the other half still works.
- Node.js 20.9+ (or Docker).

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NEXTCLOUD_URL` | yes | Nextcloud base URL the server uses, e.g. `https://cloud.example.com` |
| `SESSION_SECRET` | yes | 32+ random characters that encrypt the session cookie (`openssl rand -base64 48`) |
| `NEXTCLOUD_PUBLIC_URL` | no | Nextcloud URL as the browser sees it, if it differs from `NEXTCLOUD_URL` (e.g. internal Docker hostname) |
| `MAX_UPLOAD_MB` | no | Largest attachment AvroNext accepts, per file (default `100`). Nextcloud's own limits still apply (for issues: PHP `upload_max_filesize`/`post_max_size`) |
| `COOKIE_SECURE` | no | Defaults to `true` in production. Set `false` only when serving over plain http outside `localhost` |

## Run it

```bash
cp .env.example .env   # set NEXTCLOUD_URL and SESSION_SECRET
npm install
npm run dev            # http://localhost:3100
```

Production:

```bash
npm run build
npm start              # serves .next/standalone on $PORT (default 3000)
```

Docker:

```bash
docker build -t avronext .
docker run -p 3000:3000 -e NEXTCLOUD_URL=https://cloud.example.com -e SESSION_SECRET=... avronext
```

## Signing in

- **Continue with Nextcloud** (recommended) uses Nextcloud's [Login Flow v2](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html). The user approves AvroNext in Nextcloud's own window, so 2FA and SSO keep working and AvroNext never sees their password. The app password appears under Nextcloud › Settings › Security › Devices & sessions as "AvroNext".
- **Username and password** is a fallback. A normal password is immediately exchanged for an app password and discarded. Accounts with 2FA can paste an app password instead.

The app password is kept only in an encrypted, `httpOnly` cookie (AES-256-GCM, keyed from `SESSION_SECRET`). **Log out** revokes it in Nextcloud. If it is revoked elsewhere, the next request sends the user back to the login page.

## How it maps to Nextcloud

| AvroNext | Nextcloud |
| --- | --- |
| Project | Deck board (key = initials of the board name) |
| Status / column | Deck stack (first = to do, last = done, others = in progress) |
| Issue `KEY-123` | Deck card `123` |
| Space | Collective |
| Space overview | The collective's landing page |
| Page | Collectives page (a Markdown file in the user's `Collectives/` folder) |
| Issue attachment | Deck card attachment (the file lands in the uploader's `Deck/` folder, shared with the board) |
| Page attachment | A file in the page's `.attachments.<page id>/` folder, the same place Nextcloud Text puts them |
| Files | The user's Nextcloud Files (WebDAV), sharing via the Nextcloud Share API. The `Collectives/` folder is hidden (Spaces covers it) |

Pages are saved with a WebDAV `PUT` guarded by `If-Match`. If someone changed the page in Nextcloud while you were editing, AvroNext asks before overwriting. People, sharing and team membership are managed in Nextcloud (Deck sharing, Contacts › Teams).

## Project layout

```
src/
  app/
    login/, logout/         sign-in (Login Flow v2 + password), sign-out
    (app)/                  everything behind sign-in (top nav in layout.tsx)
      page.tsx              Your work
      projects/             project list, board, list, settings + server actions
      spaces/               space list, page view/editor + server actions
      search/
      files/                Files (My files, Recent, Favourites, Shared) + server actions
    api/avatar, api/files   authenticated proxies for avatars and files (+ api/files/zip)
    api/upload              Files uploads, streamed to Nextcloud (chunked for big files)
  components/               UI (project/, space/, create/ and shared bits)
  lib/
    nextcloud/              the only code that talks to Nextcloud (http, deck, collectives, user)
    session.ts              encrypted cookie session
    markdown*.ts            Markdown rendering + sanitising (server: sanitize-html, browser: DOMPurify)
```

## Files

A OneDrive-style view of each user's Nextcloud files: browse, upload (drag files or whole folders in; big files go up in 10 MB chunks, so there's no size cap of AvroNext's own), download (several items or a folder as a zip), new folder, rename, move/copy (also by dragging onto a folder or the breadcrumb), delete (to Nextcloud's deleted files), favourites, recent files, and sharing with people, groups and teams or by public link (password, expiry, view/edit).

Files open in a read-only viewer in the browser: images, PDF, video/audio, text and Markdown, Word (`.docx`, drawn by docx-preview in a sandboxed frame), spreadsheets (`.xlsx`, `.xls`, `.ods`, `.csv`, via SheetJS) and PowerPoint (`.pptx`, AvroNext's own lightweight slide renderer: text, pictures, shapes and tables; no animations, charts or SmartArt). Office files up to 20 MB are previewed; old `.doc`/`.ppt` files download. Nothing needs Nextcloud Office.

## Editing and Markdown

Pages and issue descriptions are stored as Markdown in Nextcloud, so the visual editor (TipTap with `@tiptap/markdown`) only offers what Markdown can hold, plus Nextcloud Text's `::: info` panels. Saving a page you didn't change writes nothing; saving after changes may tidy formatting (e.g. table columns get aligned) but never changes content. `npm run check:markdown` loads sample pages into the editor's document model, writes them back and checks they render the same and stay stable on a second save.

The editor can't co-edit live with someone using Nextcloud's own editor; if the page changed in Nextcloud meanwhile, AvroNext asks before overwriting.

## Checks

```bash
npm run typecheck
npm run check:markdown
npm run build
```

## Contributing

Issues and pull requests are welcome. Please run the checks above before opening a pull request, and for UI changes try them against a real Nextcloud (see `CLAUDE.md` for the architecture notes and a throwaway Nextcloud in Docker). Keep the core rule: AvroNext stores nothing of its own; anything that must be remembered belongs in Nextcloud.

Found a security problem? Please report it privately through GitHub's **Security › Report a vulnerability** on this repository rather than in a public issue.

## Licence

AvroNext is free software, licensed under the [GNU Affero General Public License v3.0](LICENSE) (the same licence as Nextcloud). If you run a modified version as a service for others, you must offer them its source code.

Copyright © 2026 Avrotech. The AvroNext name and the Avrotech "A" logo are Avrotech's branding: forks are welcome under the licence, but please give a modified version its own name and logo.

Not affiliated with or endorsed by Nextcloud GmbH. Nextcloud, Deck and Collectives are their respective owners' projects.
