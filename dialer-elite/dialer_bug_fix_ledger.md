# 📞 MAOS ELITE DIALER — COMPLETE BUG RESOLUTION LEDGER

This document serves as the official production ledger mapping all **11 critical VoIP, signaling, audio-hardware, and network traversal issues** diagnosed and successfully resolved in the MAOS Elite softphone.

---

## 🛠️ Category A: SIP Signaling & Dialog Traversal

### 1. 481 Transaction Does Not Exist on BYE (main.js)
* **Symptom:** Call successfully connects and audio operates, but hanging up or closing the call triggers a `481 Transaction Does Not Exist` error from the carrier, keeping the call open on the recipient's phone.
* **Root Cause:** In SIP RFC 3261, subsequent requests in a dialog (like `BYE` and `ACK`) must mirror the `To:` header tag (`toTag`) returned by the remote gateway. The client was only reading this tag from the final `200 OK` response. Some carriers generate the `toTag` in early media (`180 Ringing` or `183 Session Progress`) and omit it in `200 OK`. The client dispatched the `BYE`/`ACK` with an empty `toTag`, resulting in a mismatch on the server.
* **Resolution:** Implemented an immediate extraction guard on `180 Ringing` and `183 Session Progress` to capture and store the gateway's `toTag` early without overwriting valid active tags.

### 2. ACK Target URI standard port-5060 omission (main.js)
* **Symptom:** Call connects and audio starts but immediately drops after 3-5 seconds.
* **Root Cause:** In `sendAck()`, the target Request-URI was built with a hardcoded port suffix (`sip:${phone}@${c.host}:${c.port}`). Strict VoIP gateways require standard port signatures (`5060`) to be omitted from the start-line and URI headers, dropping handshakes otherwise.
* **Resolution:** Applied dynamic port-omission rules inside `sendAck` to strip the `:5060` signature: `const portPart = (!c.port || c.port === 5060) ? '' : ':${c.port}'`.

### 3. Duplicate Keep-Alive & Registration Interval Stacking (main.js)
* **Symptom:** Multiple duplicates of `"Registered — ONLINE"` log statements flood the socket within 1-2 seconds, creating server auth floods and eventual IP bans.
* **Root Cause:** Every time React triggered a state re-render or Supabase synced agent profiles, the configuration handler called `setSipConfig`. This spawned concurrent `setInterval` registration timers on top of existing ones without clearing them.
* **Resolution:** 
  1. Added strict credential and state-matching guards inside the configuration hook: `if (sipConfig?.username === config.username && sipConfig?.password === config.password && (isRegistered || (registerSession.callId && registerSession.authSent))) return;`.
  2. Implemented explicit `clearInterval` cleanups on `reRegisterInterval`, `keepAliveInterval`, and `optionsPingInterval` prior to initializing new loops.

### 4. Registration Watchdog Timer Expiry Loop (main.js)
* **Symptom:** Softphone operates perfectly for the first 4 minutes, but then silently drops, fails incoming calls, or rejects outbound signaling.
* **Root Cause:** After the first successful register cycle, `registerSession.authSent = true` stayed set permanently. When the 240-second SIP watchdog initiated a re-registration, the incoming `401 Unauthorized` challenge was ignored by the loop because it hit the old `if (registerSession.authSent) return;` block, leaving the softphone unauthenticated.
* **Resolution:** Programmed an automatic reset of `registerSession.authSent = false` upon receiving `200 OK` on a REGISTER transaction, and reset registration states before the watchdog re-registers.

---

## 🔐 Category B: MD5 Digest Security & Traversal

### 5. Strict MD5 `qop="auth"` Challenge Support (main.js)
* **Symptom:** Agent registers online successfully, but outbound INVITE dials trigger a loop of `401 Unauthorized` followed by `403 Forbidden` / `403 Auth Failed`.
* **Root Cause:** The VoIP carrier requested Quality of Protection (`qop="auth"`) authentication. The client's MD5 algorithm lacked support for generating client nonces (`cnonce`), maintaining nonce counts (`nc`), and calculating MD5-Session digest signatures.
* **Resolution:** Upgraded `digestAuth` to dynamically support standard MD5 and strict RFC 2617 `qop="auth"` challenges by generating random 8-byte hexadecimal client nonces and tracking transactions.

### 6. Standard SIP Port-5060 Omission Mismatch in INVITE Auth (main.js)
* **Symptom:** Continuous `403 Auth Failed` on outbound INVITE handshakes while registration succeeds.
* **Root Cause:** The client registered using the host without a port (`sip:152.57.86.141`), but calculated INVITE authentication hashes using the port (`sip:+13052248298@152.57.86.141:5060`). The carrier's switch compared hashes excluding standard ports, leading to validation mismatches.
* **Resolution:** Unified the Request-URI builder and auth block to dynamically strip the `:5060` port signature from both SIP start lines and authentication `uri="..."` headers.

### 7. Quoted QOP Parameters (main.js)
* **Symptom:** Authentication fails on strict SIP proxy gateways.
* **Root Cause:** Standard MD5 strings output `qop=auth` unquoted. Strict carriers require the parameters to be quoted as `qop="auth"`.
* **Resolution:** Hardened the digest header assembler to output `qop="auth"`.

---

## 🔊 Category C: Web Audio API & Media Hardware

### 8. Hardware-Specific `AudioContext` Lockout (App.tsx)
* **Symptom:** Softphone loads but dialing manually or auto-dialing produces no ringback, no agent voice, and no recipient voice (complete silence).
* **Root Cause:** The frontend code had hardcoded AudioContext configurations: `{ sampleRate: 8000 }`. Telephony cards support 8000Hz, but consumer sound cards and modern Chromium/Electron engines fail to initialize audio contexts at 8000Hz, blocking or crashing the audio pipeline.
* **Resolution:** Removed the hardcoded `{ sampleRate: 8000 }` restriction, allowing the AudioContext to initialize at the native hardware sample rate (e.g. `44100 Hz` or `48000 Hz`). The raw incoming `8000 Hz` PCM telephony buffers are now automatically and efficiently resampled by the Web Audio API engine.

### 9. ScriptProcessor Microphone Memory Leak (App.tsx)
* **Symptom:** After 50–100 rapid outbound auto-dials, microphone audio becomes heavily distorted, static-filled, or completely cuts out. Memory usage slowly climbs.
* **Root Cause:** The deprecated `ScriptProcessorNode` can fail to garbage-collect across rapid open/close call cycles. `stopMic()` closed the context but left the `onaudioprocess` callback running on the dying thread, causing ghost event leaks.
* **Resolution:** Added an explicit null-assignment of `onaudioprocess` before disconnecting the node in `stopMic()` to immediately stop the handler:
  ```typescript
  micScriptRef.current.onaudioprocess = null;
  micScriptRef.current.disconnect();
  ```

---

## 💻 Category D: UI Feedback & Normalization

### 10. Routine Telemetry 401 Challenge Spams (App.tsx)
* **Symptom:** The agent console fills with red `[IN] SIP/2.0 401 Unauthorized` entries, causing agents to panic thinking calls are failing.
* **Root Cause:** The telemetry console prints all raw incoming SIP packets. Under standard SIP protocols, registering or dialing sends an unauthenticated request first, receives a `401 Unauthorized` challenge, and then re-sends with MD5 credentials. This is standard handshake behavior, not an error.
* **Resolution:** Implemented an `isRoutine401` filter in `App.tsx` that silently swallows normal handshake `401` telemetry logs. Only persistent failures that fail 3 retry attempts are flagged as `AUTH_ERR` and displayed to the agent.

### 11. OPTIONS Ping Success Toast Notification Spam (main.js)
* **Symptom:** "VoIP Online! Ready to dial." toast popups appear every 30 seconds during active calls, distracting the agent.
* **Root Cause:** The 30-second OPTIONS watchdog ping response was triggering the `sip-registered` IPC event, which fired the React toast notification every 30 seconds.
* **Resolution:** Programmed the OPTIONS `200 OK` handler to silently reset keepalive counters without dispatching `sip-registered` (which is now reserved exclusively for true registration events).
