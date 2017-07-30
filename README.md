# Daily Channel Bot
### Disclaimer
This bot was built as a hobbystic solution for a friend. Therefore, it's intended to be possibly unreliable and unstable. Feel free to use it as you see fit.

### Description
This bot can be used to create timed channels. A timed channel is a weekly scheduled channel on a Discord guild server which opens at a certain time of the day, stays up for a given duration, then closes up until the next week. Timed channels che be restricted to certain roles, and can have a maximum amount of users.

### Usage
As of now, only the cannel's administrators are capable of sending commands to the bot. Type "$help" in any text chat to show the list of all commands available.

### Installation
The bot is built on top of Node.js, and requires the Discord.js and Pg.js modules. It uses a PosgreSQL database to store timer data: for a sample schema script check /src/dump.sql.