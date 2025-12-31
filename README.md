# Baileys Redis Auth State

A Redis-based authentication state provider for [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web API). Drop-in replacement for `useMultiFileAuthState`.

## Why?

Baileys provides `useMultiFileAuthState` which stores session data in local files. This works for single-server setups but becomes problematic when:

- Running multiple instances or containers
- Deploying to serverless/ephemeral environments
- Needing centralized session management

This library stores session data in Redis instead.

## Installation

```bash
npm install baileys ioredis pino pino-pretty
```

## Usage

### Before (File-based)

```javascript
import makeWASocket, { useMultiFileAuthState } from "baileys";

const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

const sock = makeWASocket({
  auth: state,
});

sock.ev.on("creds.update", saveCreds);
```

### After (Redis-based)

```javascript
import makeWASocket from "baileys";
import { useRedisAuthState } from "./src/redis-auth-state.js";

const { state, saveCreds } = await useRedisAuthState({
  sessionId: "my-session", // optional
  ttl: 86400,              // optional, in seconds
});

const sock = makeWASocket({
  auth: state,
});

sock.ev.on("creds.update", saveCreds);
```

## API

### `useRedisAuthState(options)`

| Option | Type | Description |
|--------|------|-------------|
| `sessionId` | `string \| number` | Session identifier (auto-generated if omitted) |
| `ttl` | `number` | Time-to-live in seconds for session keys (optional) |

#### Returns

| Property | Description |
|----------|-------------|
| `state` | Auth state object for Baileys |
| `saveCreds` | Function to save credentials |
| `delete` | Function to delete the entire session |
| `clear` | Function to clear signal keys only |
| `id` | The session ID |

## Multi-Session Example

```javascript
import makeWASocket from "baileys";
import { useRedisAuthState } from "./src/redis-auth-state.js";

const createSession = async (sessionId) => {
  const { state, saveCreds, delete: deleteSession } = await useRedisAuthState({
    sessionId,
  });

  const sock = makeWASocket({ auth: state });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "close") {
      // Optionally delete session on logout
      // deleteSession();
    }
  });

  return sock;
};

// Manage multiple WhatsApp sessions
await createSession("user-1");
await createSession("user-2");
```

## Features

- 🔐 Store WhatsApp session credentials in Redis
- 🔄 Drop-in replacement for `useMultiFileAuthState`
- ⏱️ Optional TTL support for session expiration
- 🔢 Auto-incremented session IDs
- 🚀 Efficient batch operations using Redis pipelines
- 🛑 Graceful shutdown handling

## Requirements

- Node.js 18+
- Redis server

## License

MIT