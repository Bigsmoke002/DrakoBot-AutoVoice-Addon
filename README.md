# DrakoBot-AutoVoice-Addon

> ⚠️ **Archived test project**
>
> This repository was a private test project (May 2025) and is provided here as an
> archive only. It is **not maintained** and there is **no support**.
> **No guarantee is given that anything works** – use at your own risk.
>
> This is an **unofficial** addon. It is not affiliated with or endorsed by the
> developers of Drako Bot. Drako Bot itself is **not** included.

## What is it?

Three addons for Drako Bot (discord.js v14) with a shared web panel:

- **Auto voice channels ("join to create")** (`voice_channels.js`): joining a configured
  join channel creates a personal voice channel (e.g. `{username}'s Channel` or sequential
  `-Room{number}-`) in a category and moves the user there. The owner gets a setup message
  to set a user limit, make the channel private, set a password or lock it. Empty channels
  are deleted automatically.
- **Auto message purge** (`message_purge.js`): messages in up to 3 channels are deleted
  automatically after a configurable number of minutes.
- **Web panel** (`webui.js`, Express, default `http://127.0.0.1:10102`): manage join
  channels, naming formats, purge channels/times, channel templates, panel theme and edit
  the raw `config.json`.
- **SQLite** storage (`database.js`, `data/drako.db`, created automatically).

## Setup (rough outline)

1. Copy the files into your Drako Bot addon folder.
2. `npm install` (`discord.js`, `express`, `sqlite3`).
3. Start the bot and open the web panel, or edit `config.json`:
   - `joinChannels` – list of `{ id, categoryId, channelFormat, useSequential }`
   - `messageDeleteTimes` – `channel1`–`channel3` with `id` and `minutes`
   - `webPort` / `webHost` – web panel address (default `127.0.0.1:10102`)

The bot needs the *Manage Channels*, *Move Members* and *Manage Messages* permissions.

## ⚠️ Security notice

The web panel has **no authentication**. Anyone who can reach it can change the whole
configuration. It therefore only listens on `127.0.0.1` by default – do not change
`webHost` to `0.0.0.0` or expose it without putting authentication in front of it.

`database.js` runs `npm install sqlite3` automatically if the module is missing.

## Changes compared to the original private version

- Personal channel and category IDs were removed from `config.json`.
- The web panel now binds to `127.0.0.1` by default (`webHost`), previously it listened on
  all interfaces.
- Added `package.json`.

## Known state

Briefly tested (October 2026, Node.js 26, discord.js 14.27, mocked Discord client):
web panel loads, adding/listing join channels and setting purge channels via the API,
joining a join channel creates the personal channel and moves the user, the channel is
deleted when it becomes empty, and the panel is not reachable from the LAN.
Not tested against a real Drako Bot installation or a live Discord server.

## License

[MIT](LICENSE)
