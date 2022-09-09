# Ivy
Bulk delete your Discord messages from the cli manually or automated

## Preview
<img src="Preview.png" alt="Ivy preview" />

## Installation
1. Install `NodeJS 18` and `npm 8`
2. `git clone https://github.com/Traurige/Ivy.git`
3. `cd Ivy`
4. `npm install`

## Usage
1. Compile the TypeScript files after the first installation or after an update
    - `npx tsc`
2. Run Ivy
    - `node src/index.js`

## Configuration
- `token` your Discord token ([How do I get it?](#Obtaining-Identifiers))
- `purgeGuilds` if true, direct messages and threads will be purged
- `purgeChannels` if true, channels will be purged (needs `purgeGuilds` to be true)
- `purgeThreads` if true, threads will be purged (needs `purgeGuilds` to be true)
- `purgeDirectMessages` if true, direct messages will be purged
- `guildsToExclude` guilds that should be preserved
- `channelsToExclude` guild channels that should be preserved
- `threadsToExclude` guild threads that should be preserved
- `directMessagesToExclude` direct messages that should be preserved
- `onlyIncludeTheseGuilds` only purge these guilds of all fetched guilds
- `onlyIncludeTheseChannels` only purge these guild channels of all fetched guild channels
- `onlyIncludeTheseThreads` only purge these guild threads of all fetched guild threads
- `onlyIncludeTheseDirectMessages` only purge these direct messages of all fetched direct messages
- `includeNsfw` if true, messages from NSFW channels will be purged
- `deletePins` if true, pinned messages will be purged
- `deleteMessagesWithAttachments` if true, messages with attachments will be purged
- `excludeMessagesBeforeDate` don't delete messages before a given date

### Example Configuration
```JSON
{
    "token": "a9sduo1onojaoIJDOjao9pjsIDJIPAIsdippa0q2jma",
    "purgeGuilds": true,
    "purgeChannels": true,
    "purgeThreads": false,
    "purgeDirectMessages": true,
    "guildsToExclude": ["01283759812912", "4891212386571"],
    "channelsToExclude": [],
    "threadsToExclude": [],
    "directMessagesToExclude": ["94891248213231"],
    "onlyIncludeTheseGuilds": [],
    "onlyIncludeTheseChannels": [],
    "onlyIncludeTheseThreads": [],
    "onlyIncludeTheseDirectMessages": [],
    "includeNsfw": true,
    "deletePins": false,
    "deleteMessagesWithAttachments": true,
    "excludeMessagesBeforeDate": "2020-05-24"
}
```

## Obtaining Identifiers
### Token
1. Open the developer tools in your Discord client or browser logged into Discord
2. Copy and paste the following code into the JavaScript console:
```JavaScript
alert((webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0).exports.default.getToken());
```
### Guild
1. Right-click a guild and click `Copy ID`
### Channel, Thread And Direct Message
1. Copy the link to a message in the channel, thread or direct message and paste it somewhere
2. Copy the second array of numbers

## Automating Ivy
1. Create a shell script that executes `node src/index.js` inside the `Ivy` folder
```shell
#!/usr/bin/bash

cd path/to/ivy
node src/index.js
```
2. Register a cron job, which executes the script

## License
[GPLv3](https://github.com/Traurige/Ivy/blob/main/COPYING)
