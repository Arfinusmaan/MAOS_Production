# MAOS ELITE DIALER — COMPLETE ARCHITECTURAL STATUS OVERVIEW & IMPLEMENTATION PLAN

This document serves as the official plain-text diagnostic ledger and priority implementation plan for the MAOS Elite Dialer application. It outlines confirmed working components, active critical/major bugs, deep-dive root cause analyses, performance optimization paths, and the exact priority action roadmap required to achieve a production-ready, high-volume outbound and inbound telephony state.

════════════════════════════════════════════════
SECTION 1 — WHAT IS WORKING
════════════════════════════════════════════════

*   **Production Release Build Pipeline:** Working because the manual extraction mechanism bypasses the Windows-specific symbolic link limitation, successfully generating the compressed, portable telephony package "MAOS Elite Dialer 1.0.0.exe".
*   **SIP Socket Lifecycle Management:** Working because the "safeClose" utility cleans up and drops the UDP socket listeners on port 5060, allowing seamless re-bindings and preventing "EADDRINUSE" port-lock crashes.
*   **Public IP & Port Discovery (STUN):** Working because the "discoverPublicIp" process executes RFC-compliant STUN queries to "stun.l.google.com" to dynamically resolve public IP and port mappings behind NAT routers.
*   **Symmetric RTP Audio Latching:** Working because the main process audio server instantly updates its internal destination targets to match the carrier's media stream IP and port as soon as the first network packet arrives.
*   **G.711 PCMU/PCMA Audio Transcoding:** Working because the linear PCM-to-ulaw/alaw lookup encoders correctly transcode raw browser microphone buffers into telephony-standard compressed codecs.
*   **Supabase Real-Time Syncing:** Working because the agent client queries, updates, and synchronized campaigns, personal VoIP line credentials, and lead dossier objects from Supabase immediately on startup.
*   **IndexedDB Local Call Logging:** Working because the "saveCall" utility writes every dial attempt, duration, direction, and outcome asynchronously to an isolated client-side storage database.
*   **Atomic Microphone Mute Control:** Working because setting the mute flag immediately blocks outgoing raw microphone buffers from entering the IPC transport bridge without tearing down the underlying RTP socket.

════════════════════════════════════════════════
SECTION 2 — WHAT IS NOT WORKING
════════════════════════════════════════════════

1.  **Outbound SIP INVITE 401/407 Authorization Loop**
    *   *Symptom:* The dialer successfully registers with the carrier's registrar, but subsequent outbound "INVITE" requests get repeatedly challenged with "401 Unauthorized" or "407 Proxy Authentication Required" until the call times out and fails.
    *   *Root Cause:* Cryptographic mismatch in the digest calculation where the MD5 hashing engine uses a "uri" parameter that does not match the exact Request-URI in the SIP start line, or the carrier requires different passwords for registration versus outbound routing.
    *   *Severity:* CRITICAL (completely blocks outbound sales calls).

2.  **Frozen/Unresponsive UI Answer Button on Incoming Calls**
    *   *Symptom:* When a call rings in, the visual Answer button is presented, but clicking it does not transition the UI to an active state, leaving the line ringing and the agent unable to connect.
    *   *Root Cause:* The React UI blocks transitions until it receives the "onSipAnswered" IPC event; if the carrier's incoming "ACK" is blocked by a firewall or router, the main process remains locked in the "answered-awaiting-ack" state and the UI remains frozen.
    *   *Severity:* MAJOR (prevents inbound telephony answering).

3.  **UI Performance Decay & Note-Taking Stuttering**
    *   *Symptom:* The dialer interface becomes sluggish after several minutes of active operations, typing inside the lead notes text area stutters, and incoming sound quality begins to crackle.
    *   *Root Cause:* The "telemetry" state array in the monolithic UI component grows without bounds by appending massive, raw multi-line SIP packets, forcing React to perform heavy virtual DOM diffs and re-renders on every single heartbeat and packet arrival.
    *   *Severity:* MAJOR (degrades agent efficiency during long shifts).

4.  **Local Audio Echo (Bidirectional Loopback leakage)**
    *   *Symptom:* The agent hears their own voice delayed by a few milliseconds in their headset, resulting in severe auditory feedback and echo.
    *   *Root Cause:* The WebRTC "getUserMedia" input channel is not properly isolated from the audio playback destination, causing local microphone captures to be outputted to the headset speaker node.
    *   *Severity:* MAJOR (causes severe agent fatigue).

════════════════════════════════════════════════
SECTION 3 — THE 401 UNAUTHORIZED LOOP
════════════════════════════════════════════════

### Plain-English Analysis
When the dialer dispatches an outbound "INVITE" to initiate a call, the carrier challenges the request with a "401 Unauthorized" or "407 Proxy Authentication Required" packet. This is standard protocol behaviour designed to prevent unauthorized routing. The packet contains a cryptographic challenge including a "nonce" (number used once) and a "realm".

The dialer is programmed to catch this challenge, calculate an MD5 digest signature using the username, password, realm, HTTP method (INVITE), and target URI, and retry the request. However, the carrier continues to respond with 401 challenges, ignoring the retry.

### Possible Causes
1.  **Digest URI Parameter Mismatch:** The MD5 digest calculation requires the "uri" parameter to match the Request-URI in the SIP start line. The start line uses "sip:target_number@carrier_host". If the "uri" parameter in our digest header is formatted differently (e.g. including or excluding ports, transports, or usernames), the carrier's calculated hash will not match our hash, triggering a continuous 401 loop.
2.  **Separate Registration vs. Outbound Credentials:** Many VoIP carrier trunks utilize two different password structures: one for registrar endpoints ("REGISTER" challenges) and another for outbound traffic gateways ("INVITE" challenges). If the Supabase database provides only the registration password, outbound dialing will be rejected.
3.  **Invalid Branch and CSeq Handling:** When replying to a 401 challenge, RFC 3261 states that the client must increment the CSeq number and generate a brand-new, unique branch string inside the "Via" header. If the dialer reuses the original CSeq or branch, the carrier interprets the retry as a duplicate packet and rejects it.
4.  **Incorrect Challenge Header Selection:** If the carrier challenges with a 407 (Proxy Authentication Required) but the dialer responds with an "Authorization" header instead of a "Proxy-Authorization" header, the security check fails.

### Diagnostic Questions to Solve the Loop
*   *Does the carrier expect a standard "Authorization" (401) or a "Proxy-Authorization" (407) header format for outbound invites?*
*   *What exact string format does the carrier expect inside the "uri" parameter of the digest header? (Does it require the port number, like ":5060", or the transport flag, like ";transport=udp"?)*
*   *Are the registration credentials identical to the gateway call routing credentials on the carrier's user profile?*

════════════════════════════════════════════════
SECTION 4 — INCOMING CALL ANSWER BUTTON
════════════════════════════════════════════════

### Complete Inbound Flow Analysis
1.  **Carrier INVITE:** The carrier dispatches a SIP "INVITE" to the agent's public UDP socket.
2.  **Main Process Ringing:** The main process receives the packet, validates the Call-ID, binds a local RTP port, sends back "180 Ringing", and dispatches the "sip-incoming-call" event to the React UI via IPC.
3.  **React UI Transition:** The React UI receives the event, transitions the status state to "incoming", starts the local ringing tone generator, and displays the "Answer" and "Decline" buttons.
4.  **Agent Click Action:** The agent clicks the green "Answer" button.
5.  **IPC Invoke:** The click handler immediately invokes "window.electronAPI.answerIncoming()", stops the ringing tone, and sets a temporary UI telemetry log: "Waiting for ACK...". Crucially, the visual state is held at "incoming" and does not transition to "active".
6.  **Main Process OK:** The main process builds a "200 OK" packet containing the local RTP SDP data, dispatches it to the carrier, and transitions the socket state to "answered-awaiting-ack".
7.  **Carrier ACK Response:** The carrier receives the "200 OK", opens its media ports, and sends back an "ACK" packet.
8.  **Main Process ACK Capture:** The main process receives the "ACK", shifts activeCall status to "active", spins up the RTP listener socket, and dispatches the "sip-answered" IPC event to the React UI.
9.  **React UI Activation:** The React UI catches the "sip-answered" event, updates status to "active", starts the call duration timer, and displays the call control HUD.

### Potential Failure Points & Button Freezing
*   **NAT/Firewall ACK Blockage:** If the carrier sends the "ACK" packet but the agent's local router blockades the incoming traffic (due to symmetric NAT mapping expiration or closed UDP ports), the main process will never receive the "ACK". It remains stuck indefinitely in "answered-awaiting-ack" and never fires the "sip-answered" IPC event. The React UI Answer button remains frozen in the "incoming" state.
*   **IPC Listener Deregistration Race:** The IPC bridge implementation in "preload.js" utilizes "ipcRenderer.removeAllListeners('sip-answered')" before registering a callback. If a rapid component re-render occurs right when the call connects, the listener is temporarily wiped out and misses the connection confirmation.
*   **Missing UI Double-Click Protection:** There is no loading or disabled state on the button once clicked. An agent clicking the button twice in rapid succession dispatches duplicate IPC invokes, corrupting the active call session object in the main process.

════════════════════════════════════════════════
SECTION 5 — APP SLOWDOWN
════════════════════════════════════════════════

A performance audit of the Electron + React wrapper highlights four primary causes of performance degradation:

1.  **Unbounded Telemetry Log Array (Likelihood: HIGH)**
    *   *Mechanism:* The "telemetry" state array in "App.tsx" appends every raw SIP message, including massive multi-line SDP descriptors. Because this array grows without limits and resides in the monolithic page state, every packet arrival triggers a massive React re-render, blocking the CPU queue.
2.  **RTP Voice Stream IPC Flooding (Likelihood: HIGH)**
    *   *Mechanism:* Telco audio requires 20ms frame delivery (50 input packets and 50 output packets per second). Passing 100 binary arrays per second across the Electron IPC bridge consumes high CPU serialization cycles, starving the main rendering thread.
3.  **Orphaned AudioContext Accumulation (Likelihood: HIGH)**
    *   *Mechanism:* The ringtone generator and recording systems create new AudioContext instances. If a call drops uncleanly without invoking context closures, these instances remain active in memory. Chrome imposes a strict limit on active AudioContexts; approaching this limit causes severe audio cracking and memory leaks.
4.  **Monolithic UI State Diffing (Likelihood: MEDIUM)**
    *   *Mechanism:* The user interface is composed of a single, massive React component (1,140+ lines). Trivial state updates (such as updating the microphone level bar or the call timer) force React to diff the entire dashboard structure, wasting rendering cycles.

════════════════════════════════════════════════
SECTION 6 — PRODUCTION READINESS CHECKLIST
════════════════════════════════════════════════

*   **SIP Registration: READY**
    *   *Reason:* Successfully performs secure digest handshakes and maintains active connectivity using a 15-second UDP keep-alive heartbeat loop.
*   **Outbound Calls: NEEDS TESTING**
    *   *Reason:* The invite routing logic is fully written but cannot establish live outbound paths until the 401 MD5 digest parameters are validated against carrier servers.
*   **Inbound Calls: NEEDS TESTING**
    *   *Reason:* Ringing alerts and 200 OK responses function perfectly, but end-to-end testing under complex firewalls is needed to ensure incoming ACK packets land.
*   **Two-Way Audio: NOT READY**
    *   *Reason:* The IPC binary transfer bridge is highly prone to CPU starvation, causing audio packet loss, stuttering, and severe delay under load.
*   **Microphone Pipeline: NEEDS TESTING**
    *   *Reason:* A high-quality averaging downsampler to 8000Hz is in place, but browser-level permissions must be verified on fresh OS installations.
*   **NAT Traversal: NEEDS TESTING**
    *   *Reason:* Uses symmetric RTP latching and public STUN IP mapping, but must be checked under restricted, multi-layered enterprise symmetric NAT firewalls.
*   **Ghost Call Prevention: READY**
    *   *Reason:* The Call-ID graveyard successfully catches and ignores out-of-sequence packets, immediately terminating orphaned carrier lines.
*   **Auto-Dialer: NEEDS TESTING**
    *   *Reason:* UI countdowns and dossier loading workflows are functional, but require integration testing with live databases to handle rapid call wrap-ups.
*   **Call History: READY**
    *   *Reason:* Reliably logs every call attempt, outcome, and metadata to an isolated IndexedDB local database via "callHistory.ts".
*   **Mute Button: READY**
    *   *Reason:* Setting "isMutedRef" immediately blocks microphone data packages from entering the outbound stream without interrupting the call session.
*   **Build Pipeline: READY**
    *   *Reason:* The electron-builder configuration is fully optimized, generating the portable Windows installer without symbolic link permission blockades.
*   **Multi-Agent Support: NEEDS TESTING**
    *   *Reason:* The Supabase database structure is configured for multiple agents, but the manifest locking mechanisms must be verified to prevent double-dialing.

════════════════════════════════════════════════
SECTION 7 — PRIORITY ACTION LIST
════════════════════════════════════════════════

1.  **Resolve Outbound Auth Loop (401/407):** Verify the MD5 digest signature calculation against the target carrier gateway to guarantee the header URI parameter matches the SIP Request-URI.
2.  **Secure Inbound Call Connections (Answer/ACK Fix):** Implement an automated safety timeout on the "answered-awaiting-ack" state in the main process to drop the socket back to a clean idle state if the carrier's ACK is blocked by a firewall.
3.  **Resolve Audio Feedback Echo:** Re-engineer the browser's "startMic" and headset playback nodes in React to completely isolate the recording input streams from local headset speaker outputs.
4.  **Optimize Telemetry Performance:** Limit the telemetry logs array to a strict maximum of 50 plain-text notifications, and completely exclude raw, multi-line SIP/SDP frames from entering the state logs.
5.  **Clean Up AudioContext Lifecycles:** Refactor "stopMic" to ensure that all "AudioContext" instances and audio processing nodes are explicitly closed and destroyed upon call termination, preventing memory leaks.
6.  **Refactor the Telemetry UI Component:** Deconstruct the massive monolithic layout by splitting the live log console into an isolated, memoized sub-component to prevent telemetry updates from re-rendering the main dashboard.
7.  **Symmetric Firewall Penetration Auditing:** Conduct network diagnostics across various network structures (cellular, office routers) to confirm STUN traversal and symmetric RTP function flawlessly.
8.  **Verify Lead-Locking Database Logic:** Run diagnostic tests on Supabase using multiple active instances to guarantee that the "parseLeads" queue prevents concurrent dialing conflicts.

════════════════════════════════════════════════
