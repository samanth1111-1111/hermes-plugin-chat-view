# Chat View

Struggling to find the right session in Hermes? Struggle no longer with Chat View, a simple, reliable way to stop squinting at titles or guessing which chat you’re looking for. See your sessions in a spacious main view, with big, bold titles and message summaries that show what each chat is about at a glance. In side view, browse on the left and chat on the right. You can open a conversation without losing your place. There’s also a simple project folder system to help you organize your chats.

## Features

- Browse chats as cards with titles, recent user prompts, and timestamps.
- Search titles and previews; filter by source, activity, and pull-request metadata.
- Organize chats in folders and assign card colors.
- Open Chat View from the sidebar, status bar, or command palette.

## Package contents

```text
chat-view/
  plugin.yaml
  README.md
  desktop/
    plugin.js
```

This is a desktop-only package. No Python tools, API keys, additional dependencies, or build step are required. React and `@hermes/plugin-sdk` are supplied by Hermes Desktop.

## Install

For the single-file desktop installation, copy `desktop/plugin.js` into:

```text
<HERMES_HOME>/desktop-plugins/chat-view/plugin.js
```

Use the actual home directory configured by your Hermes installation. Enable Chat View under **Capabilities > Plugins**. If needed, use **Reload desktop plugins** in the command palette.

For the unified package layout, place the complete `chat-view` directory under `<HERMES_HOME>/plugins/`, preserving `desktop/plugin.js` and `plugin.yaml`.

Avoid installing both copies at once; use one installation layout.

## Use

1. Open **Chat View** from the sidebar, status bar, or command palette.
2. Select a card count and browse the gallery.
3. Use search, filters, and sorting to find a conversation.
4. Select a card to open its chat.
5. Use a card's color, folder, archive, and delete controls to organize conversations.

Preferences and folder assignments use plugin-scoped Hermes storage. Archive and delete controls act on real conversations; permanent deletion cannot be undone.

## Validation

With the Hermes CLI available, run these from this package directory:

```text
hermes plugins doctor . --ci
hermes plugins validate .
```

For a JavaScript syntax check in PowerShell with Node.js:

```powershell
Get-Content -Raw desktop/plugin.js | node --input-type=module --check
```

The host supplies the SDK at runtime. Syntax validation alone does not verify SDK compatibility or live rendering. Before submitting, open the package in Hermes Desktop and review the gallery, conversation placement, each card layout, search, filters, and folders.
