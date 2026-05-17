import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import path from 'path';
import { fileURLToPath } from 'url';
import dgram from 'dgram';
import crypto from 'crypto';
import os from 'os';
import fs from 'fs';

// Chromium Security Bypass Flags for Microphone Access
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

function safeClose(sock) {
  if (!sock) return;
  try {
    sock.removeAllListeners();
    sock.on('error', () => {}); // sink
    sock.close();
  } catch (e) {}
}

// ---- State ----

// Set a unique data path to avoid cache collisions
if (!isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'maos-elite-dialer-storage'));
}

// ---- Local IP ----
function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

function parseStunResponse(response) {
  let offset = 20;
  while (offset < response.length) {
    if (offset + 4 > response.length) break;
    const type = response.readUInt16BE(offset);
    const length = response.readUInt16BE(offset + 2);
    if (offset + 4 + length > response.length) break;

    if (type === 0x0020) { // XOR-MAPPED-ADDRESS
      const MAGIC = Buffer.from([0x21, 0x12, 0xA4, 0x42]);
      const family = response.readUInt8(offset + 5);
      if (family === 0x01) {
        const port = response.readUInt16BE(offset + 6) ^ 0x2112;
        const ip = [
          response.readUInt8(offset + 8)  ^ MAGIC[0],
          response.readUInt8(offset + 9)  ^ MAGIC[1],
          response.readUInt8(offset + 10) ^ MAGIC[2],
          response.readUInt8(offset + 11) ^ MAGIC[3],
        ].join('.');
        return { ip, port };
      }
    } else if (type === 0x0001) { // MAPPED-ADDRESS
      const family = response.readUInt8(offset + 5);
      if (family === 0x01) {
        const port = response.readUInt16BE(offset + 6);
        const ip = [
          response.readUInt8(offset + 8),
          response.readUInt8(offset + 9),
          response.readUInt8(offset + 10),
          response.readUInt8(offset + 11),
        ].join('.');
        return { ip, port };
      }
    }
    offset += 4 + length;
  }
  return null;
}

async function discoverPublicIp() {
  return new Promise((resolve) => {
    let resolved = false;
    let socket = null;

    const cleanup = (ip) => {
      if (resolved) return;
      resolved = true;
      if (socket) {
        try { socket.close(); } catch(e) {}
        socket = null;
      }
      resolve(ip);
    };

    try {
      socket = dgram.createSocket('udp4');

      socket.on('error', (err) => {
        console.warn('[STUN_ERR]', err.message);
        cleanup(null);
      });

      socket.on('message', (response) => {
        if (resolved) return;
        const res = parseStunResponse(response);
        const ip = res ? res.ip : null;
        cleanup(ip);
        if (mainWin) mainWin.webContents.send('sip-incoming', { message: `[NAT] STUN Discovered: ${ip || 'Fallback'}` });
      });

      const transactionId = crypto.randomBytes(12);
      const stunRequest = Buffer.concat([
        Buffer.from([0x00, 0x01, 0x00, 0x00]),
        Buffer.from([0x21, 0x12, 0xA4, 0x42]),
        transactionId
      ]);

      socket.send(stunRequest, 19302, 'stun.l.google.com', (err) => {
        if (err) {
          console.warn('[STUN_SEND_ERR]', err.message);
          cleanup(null);
        }
      });

      setTimeout(() => cleanup(null), 3000);

    } catch(e) {
      console.warn('[STUN_INIT_ERR]', e.message);
      cleanup(null);
    }
  });
}

async function getPublicPort(socket) {
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = (port) => {
      if (resolved) return;
      resolved = true;
      resolve(port);
    };
    const transactionId = crypto.randomBytes(12);
    const stunRequest = Buffer.concat([
      Buffer.from([0x00, 0x01, 0x00, 0x00]),
      Buffer.from([0x21, 0x12, 0xA4, 0x42]),
      transactionId
    ]);
    const onMsg = (msg) => {
      const port = parseStunResponse(msg)?.port;
      if (port) cleanup(port);
    };
    socket.once('message', onMsg);
    socket.send(stunRequest, 19302, 'stun.l.google.com');
    setTimeout(() => cleanup(null), 500);
  });
}

let mainWin = null;
let sipConfig = null;
let localIP = getLocalIP();
let publicIp = null;
let localPort = 5060;
let keepAliveInterval = null;
let reRegisterInterval = null;
let optionsPingInterval = null;
let consecutivePingFailures = 0;
let optionsPingSentTime = null;
let optionsPingTimeout = null;
let isRegistered = false;

// Separate session state for REGISTER vs INVITE
let registerSession = { callId: null, fromTag: null, cseq: 0, authSent: false };
let activeCall = {
  phone: null, callId: null, fromTag: null, toTag: null, remoteUri: null,
  cseq: 1, rtpPort: null, rtpSocket: null,
  remoteRtpHost: null, remoteRtpPort: null,
  rtpSeq: 0, rtpTs: 0, ssrc: null, busy: false,
  authSent: false, lastBranch: null, lastStatus: null,
  punchInterval: null, timeoutHandle: null,
  authAttempts: 0, lastNonce: null, lastMicLog: 0,
  pendingOkPacket: null,
  okRetransmitInterval: null,
  ackTimeoutHandle: null
};

function resetActiveCall() {
  const oldPhone = activeCall.phone;
  if (activeCall.rtpSocket) { safeClose(activeCall.rtpSocket); }
  if (activeCall.punchInterval) clearInterval(activeCall.punchInterval);
  if (activeCall.timeoutHandle) clearTimeout(activeCall.timeoutHandle);
  if (activeCall.okRetransmitInterval) clearTimeout(activeCall.okRetransmitInterval);
  if (activeCall.ackTimeoutHandle) clearTimeout(activeCall.ackTimeoutHandle);
  
  activeCall = { 
    phone: oldPhone, callId: null, fromTag: null, toTag: null, remoteUri: null, cseq: 1, 
    rtpPort: null, rtpSocket: null, remoteRtpHost: null, remoteRtpPort: null,
    rtpSeq: 0, rtpTs: 0, ssrc: Math.floor(Math.random() * 0xFFFFFFFF), busy: false, authSent: false, lastBranch: null, lastStatus: null,
    punchInterval: null, timeoutHandle: null,
    authAttempts: 0, lastNonce: null, lastMicLog: 0,
    pendingOkPacket: null,
    okRetransmitInterval: null,
    ackTimeoutHandle: null
  };
  // 1s cooldown to let carrier state clear
  setTimeout(() => {
    if (mainWin) mainWin.webContents.send('sip-ended', {});
  }, 1000);
}


// ---- G.711 u-law encoder/decoder ----
function linear2ulaw(pcm) {
  let s = pcm;
  const mask = s < 0 ? 0x7f : 0xff;
  if (s < 0) s = -s;
  if (s > 32635) s = 32635;
  s += 132;
  let exp = 7;
  if (s <= 16383) exp = 6;
  if (s <= 8191)  exp = 5;
  if (s <= 4095)  exp = 4;
  if (s <= 2047)  exp = 3;
  if (s <= 1023)  exp = 2;
  if (s <= 511)   exp = 1;
  if (s <= 255)   exp = 0;
  let mant = (s >> (exp + 3)) & 0x0f;
  return ~( (exp << 4) | mant ) & mask;
}

function ulaw2linear(u) {
  u = (~u) & 0xff;
  const sign = u & 0x80;
  const exp  = (u >> 4) & 0x07;
  const mant = u & 0x0f;
  let s = ((mant << 3) + 132) << exp;
  return sign ? 132 - s : s - 132;
}

function alaw2linear(a) {
  a ^= 0x55;
  const sign = a & 0x80;
  let exp = (a >> 4) & 0x07;
  let mant = a & 0x0f;
  let s = (exp === 0) ? (mant << 4) + 8 : ((mant << 4) + 0x108) << (exp - 1);
  return sign ? s : -s;
}

function linear2alaw(pcm) {
  const mask = pcm < 0 ? 0xD5 : 0x55;
  let s = pcm < 0 ? -pcm : pcm;
  let exp = 7;
  if (s <= 31) exp = 0;
  else if (s <= 63) exp = 1;
  else if (s <= 127) exp = 2;
  else if (s <= 255) exp = 3;
  else if (s <= 511) exp = 4;
  else if (s <= 1023) exp = 5;
  else if (s <= 2047) exp = 6;
  
  let mant;
  if (exp === 0) mant = (s >> 1) & 0x0F;
  else mant = (s >> (exp + 3)) & 0x0F;
  return ((exp << 4) | mant) ^ mask;
}

function startRTP(port, existingSock = null) {
  if (activeCall.rtpSocket && activeCall.rtpSocket !== existingSock) { safeClose(activeCall.rtpSocket); }
  const sock = existingSock || dgram.createSocket('udp4');
  if (!existingSock) sock.bind(port);

  let latched = false;
  sock.on('message', (msg, rinfo) => {
    // 1. Symmetric RTP Latching
    if (!latched) {
      activeCall.remoteRtpHost = rinfo.address;
      activeCall.remoteRtpPort = rinfo.port;
      latched = true;
      console.log(`[RTP] Latched onto Carrier Audio at ${rinfo.address}:${rinfo.port}`);
      if (mainWin) mainWin.webContents.send('sip-incoming', { message: `[RTP] Audio Stream Latched (${rinfo.address})` });
    }

    if (msg.length < 12) return;
    const payloadType = msg[1] & 0x7f;
    const raw = msg.slice(12);
    const pcm = new Int16Array(raw.length);

    if (payloadType === 0) { // PCMU
      for (let i = 0; i < raw.length; i++) pcm[i] = ulaw2linear(raw[i]);
      if (mainWin) mainWin.webContents.send('rtp-audio', Buffer.from(pcm.buffer));
    } else if (payloadType === 8) { // PCMA
      for (let i = 0; i < raw.length; i++) pcm[i] = alaw2linear(raw[i]);
      if (mainWin) mainWin.webContents.send('rtp-audio', Buffer.from(pcm.buffer));
    }
  });

  activeCall.rtpSocket = sock;

  // 2. NAT Hole Punching (Silent Keepalives) - ONLY during ringing
  if (activeCall.punchInterval) clearInterval(activeCall.punchInterval);
  
  const punch = () => {
    // If call is busy, the microphone handler handles the RTP stream. Stop punching.
    if (activeCall.busy || !activeCall.rtpSocket || !activeCall.remoteRtpHost) {
      if (activeCall.busy && activeCall.punchInterval) {
        clearInterval(activeCall.punchInterval);
        activeCall.punchInterval = null;
      }
      return;
    }

    const silentRtpPacket = Buffer.alloc(12);
    silentRtpPacket[0] = 0x80;
    silentRtpPacket[1] = 0x00; // PCMU
    silentRtpPacket.writeUInt16BE(activeCall.rtpSeq++, 2);
    silentRtpPacket.writeUInt32BE(activeCall.rtpTs, 4);
    try {
      activeCall.rtpSocket.send(
        silentRtpPacket,
        activeCall.remoteRtpPort,
        activeCall.remoteRtpHost
      );
    } catch (e) {}
  };

  punch(); // Fire immediately
  activeCall.punchInterval = setInterval(punch, 100);
}

// ---- SIP Socket ----
let bindAttempts = 0;
const udpSocket = dgram.createSocket('udp4');

udpSocket.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    bindAttempts++;
    if (bindAttempts > 3) {
      console.log(`[UDP] Multiple ports busy. Binding to dynamic OS-assigned port...`);
      udpSocket.bind(0, '0.0.0.0', () => {
        localPort = udpSocket.address().port;
        const msg = `[UDP] Bound to dynamic local port ${localIP}:${localPort}`;
        console.log(msg);
        if (mainWin) mainWin.webContents.send('sip-incoming', { message: msg });
      });
    } else {
      const nextPort = 5060 + (bindAttempts * 20) + Math.floor(Math.random() * 10);
      console.log(`[UDP] Port busy, trying port ${nextPort}...`);
      udpSocket.bind(nextPort, '0.0.0.0', () => {
        localPort = udpSocket.address().port;
        const msg = `[UDP] Bound to backup port ${localIP}:${localPort}`;
        console.log(msg);
        if (mainWin) mainWin.webContents.send('sip-incoming', { message: msg });
      });
    }
  } else {
    console.error('[UDP_FATAL]', err.message);
  }
});

udpSocket.bind(5060, '0.0.0.0', () => {
  localPort = udpSocket.address().port;
  const msg = `[UDP] Bound to primary port ${localIP}:${localPort}`;
  console.log(msg);
  if (mainWin) mainWin.webContents.send('sip-incoming', { message: msg });
});

// ---- MD5 Auth ----
function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }
function digestAuth(method, uri, nonce, realm, qop = null, nc = null, cnonce = null) {
  const ha1 = md5(`${sipConfig.username}:${realm}:${sipConfig.password}`);
  const ha2 = md5(`${method}:${uri}`);
  if (qop === 'auth' || qop === 'auth-int') {
    return md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  }
  return md5(`${ha1}:${nonce}:${ha2}`);
}

// ---- Build SIP Packet ----
function buildPacket(method, opts = {}) {
  const c = sipConfig;
  const isRegister = method === 'REGISTER';
  const target = opts.phone || activeCall.phone;
  const portPart = (!c.port || c.port === 5060) ? '' : `:${c.port}`;
  const uri = isRegister ? `sip:${c.host}` : (method === 'BYE' && activeCall.remoteUri ? activeCall.remoteUri : `sip:${target}@${c.host}${portPart}`);

  const branch = opts.branch || ('z9hG4bK' + crypto.randomBytes(8).toString('hex'));
  if (method === 'INVITE' || method === 'ACK') activeCall.lastBranch = branch;

  let callId, fromTag, cseq;
  if (isRegister) {
    if (!registerSession.callId) {
      registerSession.callId   = crypto.randomBytes(8).toString('hex') + '@' + localIP;
      registerSession.fromTag  = crypto.randomBytes(6).toString('hex');
      registerSession.cseq     = 0;
      registerSession.authSent = false;
    }
    registerSession.cseq++;
    callId  = registerSession.callId;
    fromTag = registerSession.fromTag;
    cseq    = registerSession.cseq;
  } else {
    callId  = opts.callId  || activeCall.callId  || (crypto.randomBytes(8).toString('hex') + '@' + localIP);
    fromTag = opts.fromTag || activeCall.fromTag || crypto.randomBytes(6).toString('hex');
    cseq    = opts.cseq   || ++activeCall.cseq;
  }

  const ipToUse = publicIp || localIP;
  const lines = [
    `${method} ${uri} SIP/2.0`,
    `Via: SIP/2.0/UDP ${ipToUse}:${localPort};branch=${branch};rport`,
    `Max-Forwards: 70`,
    `From: "${c.username}" <sip:${c.username}@${c.host}>;tag=${fromTag}`,
    `To: <sip:${isRegister ? c.username : target}@${c.host}>${(!isRegister && activeCall.toTag) ? (';tag=' + activeCall.toTag) : ''}`,
    `Call-ID: ${callId}`,
    `CSeq: ${cseq} ${method}`,
    `User-Agent: MAOS-Elite/1.0`,
    `P-Asserted-Identity: <sip:${c.username}@${c.host}>`,
    `Contact: <sip:${c.username}@${ipToUse}:${localPort};transport=udp>`,
  ];
  if (opts.extraHeaders) lines.push(...opts.extraHeaders);

  if (isRegister) {
    lines.push('Expires: 300', 'Content-Length: 0', '', '');
    return lines.join('\r\n');
  }

  if (method === 'INVITE') {
    const rtpPort = activeCall.rtpPort || 10000 + Math.floor(Math.random() * 5000) * 2;
    activeCall.rtpPort = rtpPort;
    const ipToUse = publicIp || localIP;
    const sdp = [
      `v=0`,
      `o=${c.username} ${Date.now()} ${Date.now()} IN IP4 ${ipToUse}`,
      `s=MAOS Elite`,
      `c=IN IP4 ${ipToUse}`,
      `t=0 0`,
      `m=audio ${activeCall.publicRtpPort || rtpPort} RTP/AVP 0 8 101`,
      `a=rtpmap:0 PCMU/8000`,
      `a=rtpmap:8 PCMA/8000`,
      `a=rtpmap:101 telephone-event/8000`,
      `a=fmtp:101 0-15`,
      `a=sendrecv`,
      `a=direction:sendrecv`,
      `a=rtcp-mux`,
      ``
    ].join('\r\n');
    lines.push(
      'Allow: INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY',
      'Content-Type: application/sdp',
      `Content-Length: ${Buffer.byteLength(sdp)}`,
      '', sdp
    );
    return lines.join('\r\n');
  }

  lines.push('Content-Length: 0', '', '');
  return lines.join('\r\n');
}

function sendUdp(pkt) {
  if (!sipConfig) return;
  const firstLine = pkt.split('\r\n')[0];
  if (!firstLine.startsWith('OPTIONS')) {
    console.log('[UDP_OUT]', firstLine);
  }
  udpSocket.send(Buffer.from(pkt), sipConfig.port, sipConfig.host, (e) => { if(e) console.error('[UDP_ERR]', e.message); });
}

// ---- Options Ping Watchdog Helper ----
function sendOptionsping() {
  if (!sipConfig) return;
  const branch = 'z9hG4bK' + crypto.randomBytes(8).toString('hex');
  const ipToUse = publicIp || localIP;
  const pkt = [
    `OPTIONS sip:${sipConfig.host} SIP/2.0`,
    `Via: SIP/2.0/UDP ${ipToUse}:${localPort};branch=${branch};rport`,
    `Max-Forwards: 70`,
    `From: "${sipConfig.username}" <sip:${sipConfig.username}@${sipConfig.host}>;tag=${crypto.randomBytes(6).toString('hex')}`,
    `To: <sip:${sipConfig.username}@${sipConfig.host}>`,
    `Call-ID: ${crypto.randomBytes(8).toString('hex')}@${localIP}`,
    `CSeq: ${Math.floor(Math.random() * 1000) + 1} OPTIONS`,
    `User-Agent: MAOS-Elite/1.0`,
    `Contact: <sip:${sipConfig.username}@${ipToUse}:${localPort};transport=udp>`,
    `Content-Length: 0`, '', ''
  ].join('\r\n');
  
  sendUdp(pkt);
  optionsPingSentTime = Date.now();
  
  if (optionsPingTimeout) clearTimeout(optionsPingTimeout);
  optionsPingTimeout = setTimeout(() => {
    if (optionsPingSentTime !== null) {
      consecutivePingFailures++;
      console.log(`[SIP] OPTIONS ping failure count: ${consecutivePingFailures}`);
      if (consecutivePingFailures >= 2) {
        console.log('[SIP] Re-registration watchdog triggered re-register.');
        if (mainWin) mainWin.webContents.send('sip-offline', {});
        isRegistered = false;
        registerSession.authSent = false;
        sendUdp(buildPacket('REGISTER'));
        consecutivePingFailures = 0;
      }
    }
  }, 5000);
}

// ---- Keep-Alive ----
function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    if (sipConfig) udpSocket.send(Buffer.from('\r\n\r\n'), sipConfig.port, sipConfig.host);
  }, 15000);

  // FIX BUG 1 & 5: Clear old interval before starting new one.
  // Reset auth state before each watchdog re-registration so 401 challenge can be answered.
  if (reRegisterInterval) clearInterval(reRegisterInterval);
  reRegisterInterval = setInterval(() => {
    if (sipConfig) {
      console.log('[SIP] Watchdog triggers automatic re-registration');
      isRegistered = false;
      registerSession.authSent = false;
      sendUdp(buildPacket('REGISTER'));
    }
  }, 240000); // 240 seconds

  if (optionsPingInterval) clearInterval(optionsPingInterval);
  optionsPingInterval = setInterval(() => {
    sendOptionsping();
  }, 30000); // 30 seconds
}

// ---- ACK helper ----
function sendAck(phone, callId, fromTag, toTag, cseq, branch) {
  const c = sipConfig;
  // FIX BUG 3: Omit port 5060 from URI — SIP standard requires it
  const portPart = (!c.port || c.port === 5060) ? '' : `:${c.port}`;
  const uri = activeCall.remoteUri || `sip:${phone}@${c.host}${portPart}`;
  const ipToUse = publicIp || localIP;
  const ack = [
    `ACK ${uri} SIP/2.0`,
    `Via: SIP/2.0/UDP ${ipToUse}:${localPort};branch=${branch || ('z9hG4bK' + crypto.randomBytes(8).toString('hex'))};rport`,
    `Max-Forwards: 70`,
    `From: "${c.username}" <sip:${c.username}@${c.host}>;tag=${fromTag}`,
    `To: <sip:${phone}@${c.host}>;tag=${toTag || ''}`,
    `Call-ID: ${callId}`,
    `CSeq: ${cseq} ACK`,
    `Contact: <sip:${c.username}@${ipToUse}:${localPort}>`,
    `Content-Length: 0`, '', ''
  ].join('\r\n');
  sendUdp(ack);
}

const deadCallIds = new Set();
setInterval(() => deadCallIds.clear(), 300000); // clear every 5 mins

// ---- Incoming SIP Handler ----
udpSocket.on('message', (msg, rinfo) => {
  const text = msg.toString();
  const isOptions = text.includes('OPTIONS');
  if (mainWin && !isOptions) mainWin.webContents.send('sip-incoming', { message: text });

  const rawFirst = text.split('\r\n')[0] || '';
  const stripped = rawFirst.replace(/[^\x20-\x7E]/g, '').trim();
  if (!stripped) return;

  const msgCallIdM = text.match(/^Call-ID:\s*(.+)/im);
  const msgCallId = msgCallIdM ? msgCallIdM[1].trim() : '';

  // --- Call ID Graveyard (Kill 481 Loops) ---
  if (deadCallIds.has(msgCallId)) {
    return;
  }

  const validCommands = ['INVITE', 'BYE', 'ACK', 'REGISTER', 'OPTIONS', 'CANCEL', 'SIP/2.0'];
  if (!validCommands.some(cmd => stripped.startsWith(cmd))) return;

  const first = stripped;

  // --- ACK (Inbound call confirmed, now safe to start RTP) ---
  if (first.startsWith('ACK')) {
    if (msgCallId === activeCall.callId && activeCall.lastStatus === 'answered-awaiting-ack') {
      if (activeCall.okRetransmitInterval) {
        clearTimeout(activeCall.okRetransmitInterval);
        activeCall.okRetransmitInterval = null;
      }
      if (activeCall.ackTimeoutHandle) {
        clearTimeout(activeCall.ackTimeoutHandle);
        activeCall.ackTimeoutHandle = null;
      }
      activeCall.pendingOkPacket = null;
      
      activeCall.lastStatus = 'active';
      console.log('[SIP] ACK received. Starting inbound RTP now.');
      startRTP(activeCall.rtpPort);
      if (mainWin) mainWin.webContents.send('sip-answered', {});
    }
    return;
  }

  // --- Incoming INVITE (Manual Answer) ---
  if (first.startsWith('INVITE')) {
    const callIdM = text.match(/^Call-ID:\s*(.+)/im);
    const fromM   = text.match(/^From:.*$/im);
    const toM     = text.match(/^To:.*$/im);
    const cseqM   = text.match(/CSeq:\s*(\d+)\s+INVITE/i);
    const viaM    = text.match(/^Via:.*$/im);
    const contactM = text.match(/^Contact:\s*<([^>]+)>/im);

    if (activeCall.busy || activeCall.lastStatus === 'ringing' || activeCall.lastStatus === 'incoming-ringing') {
      const busyLines = [`SIP/2.0 486 Busy Here`];
      if (viaM) busyLines.push(viaM[0]);
      if (fromM) busyLines.push(fromM[0]);
      if (toM) busyLines.push(toM[0]);
      busyLines.push(`Call-ID: ${callIdM ? callIdM[1].trim() : ''}`);
      busyLines.push(`CSeq: ${cseqM ? cseqM[1] : 1} INVITE`);
      busyLines.push(`Content-Length: 0`, '', '');
      sendUdp(busyLines.join('\r\n'));
      return;
    }

    const toTag = 'tag' + crypto.randomBytes(6).toString('hex');
    activeCall.callId = callIdM ? callIdM[1].trim() : '';
    activeCall.phone = 'incoming';
    if (contactM) activeCall.remoteUri = contactM[1];
    
    const mAudio = text.match(/m=audio\s+(\d+)\s+RTP\/AVP/i);
    const cConn  = text.match(/c=IN\s+IP4\s+([0-9.]+)/i);
    if (mAudio && cConn) {
      activeCall.remoteRtpPort = parseInt(mAudio[1]);
      activeCall.remoteRtpHost = cConn[1];
    } else {
      activeCall.remoteRtpPort = 10000;
      activeCall.remoteRtpHost = sipConfig.host;
    }

    activeCall.rtpPort = 10000 + Math.floor(Math.random() * 5000) * 2;
    activeCall.busy = false;
    activeCall.lastStatus = 'incoming-ringing';

    const ourTo = toM ? toM[0] + `;tag=${toTag}` : '';

    activeCall.incomingReq = {
      via: viaM ? viaM[0] : '',
      from: fromM ? fromM[0] : '',
      to: ourTo,
      cseq: cseqM ? cseqM[1] : 1
    };

    const ringLines = [`SIP/2.0 180 Ringing`];
    if (activeCall.incomingReq.via) ringLines.push(activeCall.incomingReq.via);
    if (activeCall.incomingReq.from) ringLines.push(activeCall.incomingReq.from);
    if (activeCall.incomingReq.to) ringLines.push(activeCall.incomingReq.to);
    ringLines.push(`Call-ID: ${activeCall.callId}`);
    ringLines.push(`CSeq: ${activeCall.incomingReq.cseq} INVITE`);
    ringLines.push(`Contact: <sip:${sipConfig.username}@${localIP}:${localPort}>`);
    ringLines.push(`Content-Length: 0`, '', '');

    sendUdp(ringLines.join('\r\n'));

    console.log('[SIP] Incoming call ringing...');
    if (mainWin) mainWin.webContents.send('sip-incoming-call', { phone: activeCall.remoteUri || 'Unknown' });
    return;
  }

  // --- CANCEL (Caller cancelled) ---
  if (first.startsWith('CANCEL')) {
    const callIdM = text.match(/^Call-ID:\s*(.+)/im);
    const cId = callIdM ? callIdM[1].trim() : '';
    if (cId === activeCall.callId) {
      console.log('[SIP] Caller canceled.');
      const viaM = text.match(/^Via:.*$/im);
      const fromM = text.match(/^From:.*$/im);
      const toM = text.match(/^To:.*$/im);
      const cseqM = text.match(/CSeq:\s*(\d+)/i);
      
      const okLines = [`SIP/2.0 200 OK`];
      if (viaM) okLines.push(viaM[0]);
      if (fromM) okLines.push(fromM[0]);
      if (toM) okLines.push(toM[0]);
      okLines.push(`Call-ID: ${activeCall.callId}`);
      okLines.push(`CSeq: ${cseqM ? cseqM[1] : 1} CANCEL`);
      okLines.push(`Content-Length: 0`, '', '');
      sendUdp(okLines.join('\r\n'));

      const termLines = [`SIP/2.0 487 Request Terminated`];
      if (activeCall.incomingReq) {
        if (activeCall.incomingReq.via) termLines.push(activeCall.incomingReq.via);
        if (activeCall.incomingReq.from) termLines.push(activeCall.incomingReq.from);
        if (activeCall.incomingReq.to) termLines.push(activeCall.incomingReq.to);
        termLines.push(`Call-ID: ${activeCall.callId}`);
        termLines.push(`CSeq: ${activeCall.incomingReq.cseq} INVITE`);
        termLines.push(`Content-Length: 0`, '', '');
        sendUdp(termLines.join('\r\n'));
      }

      resetActiveCall();
      if (mainWin) mainWin.webContents.send('sip-ended', {});
    }
    return;
  }

  if (!isOptions) {
    console.log(`[SIP_IN] ${first}  (from ${rinfo.address}:${rinfo.port})`);
  }
  if (!sipConfig) return;

  // --- Global ACK for non-2xx final responses (RFC 3261) ---
  if (/^[456]\d\d/.test(first)) {
    const cseqM = text.match(/CSeq:\s*(\d+)\s+(\w+)/i);
    if (cseqM && cseqM[2] === 'INVITE') {
      const toTagM = text.match(/^To:.*?;tag=([^\s;]+)/im);
      const toTag = toTagM ? toTagM[1] : '';
      const fromTagM = text.match(/^From:.*?;tag=([^\s;]+)/im);
      const fromTag = fromTagM ? fromTagM[1] : (msgCallId === activeCall.callId ? activeCall.fromTag : '');
      const branchM = text.match(/^Via:.*?;branch=([^\s;]+)/im);
      const branch = msgCallId === activeCall.callId ? activeCall.lastBranch : (branchM ? branchM[1] : '');
      const toUriM = text.match(/^To:\s*(?:<)?(sip:[^>;]+)/im);
      const toUri = toUriM ? toUriM[1] : '';

      const ack = [
        `ACK ${msgCallId === activeCall.callId && activeCall.remoteUri ? activeCall.remoteUri : toUri} SIP/2.0`,
        `Via: SIP/2.0/UDP ${localIP}:${localPort};branch=${branch || ('z9hG4bK' + crypto.randomBytes(8).toString('hex'))};rport`,
        `Max-Forwards: 70`,
        `From: "${sipConfig.username}" <sip:${sipConfig.username}@${sipConfig.host}>;tag=${fromTag}`,
        `To: ${toUri};tag=${toTag}`,
        `Call-ID: ${msgCallId}`,
        `CSeq: ${cseqM[1]} ACK`,
        `Contact: <sip:${sipConfig.username}@${localIP}:${localPort}>`,
        `Content-Length: 0`, '', ''
      ].join('\r\n');
      sendUdp(ack);
      
      if (msgCallId === activeCall.callId) {
        if (!first.includes('401') && !first.includes('407') && !first.includes('487')) {
          console.log(`[SIP] Call failed with status: ${first}`);
          deadCallIds.add(activeCall.callId);
          resetActiveCall();
        }
      }
    }
  }

  // Extract To-tag from response
  const toTagM = text.match(/^To:.*?;tag=([^\s;]+)/im);
  const toTag  = toTagM ? toTagM[1] : '';

  // --- 401 / 407 Auth ---
  if (text.includes('401 Unauthorized') || text.includes('407 Proxy Authentication')) {
    if (msgCallId !== activeCall.callId && msgCallId !== registerSession.callId) return;

    const nonceM = text.match(/nonce="([^"]+)"/i);
    const realmM = text.match(/realm="([^"]+)"/i);
    const cseqM  = text.match(/CSeq:\s*(\d+)\s+(\w+)/i);
    if (!nonceM || !realmM || !cseqM) return;

    const nonce = nonceM[1];
    const realm = realmM[1];
    const method  = cseqM[2];

    const portPart = (!sipConfig.port || sipConfig.port === 5060) ? '' : `:${sipConfig.port}`;
    let uri = `sip:${sipConfig.host}`;
    if (method === 'REGISTER' || method === 'OPTIONS') {
      uri = `sip:${sipConfig.host}`;
    } else if (method === 'BYE' && activeCall.remoteUri) {
      uri = activeCall.remoteUri;
    } else {
      uri = `sip:${activeCall.phone}@${sipConfig.host}${portPart}`;
    }

    const qopM = text.match(/qop="?([^",\s]+)"?/i);
    const qop = qopM ? qopM[1] : null;
    let nc = null;
    let cnonce = null;
    if (qop) {
      nc = '00000001';
      cnonce = crypto.randomBytes(8).toString('hex');
    }

    const resp = digestAuth(method, uri, nonce, realm, qop, nc, cnonce);
    const authName = text.includes('407') ? 'Proxy-Authorization' : 'Authorization';

    let authParts = [
      `username="${sipConfig.username}"`,
      `realm="${realm}"`,
      `nonce="${nonce}"`,
      `uri="${uri}"`,
      `response="${resp}"`,
      `algorithm=MD5`
    ];
    if (qop) {
      authParts.push(`qop="${qop}"`);
      authParts.push(`nc=${nc}`);
      authParts.push(`cnonce="${cnonce}"`);
    }
    const authHdr = `${authName}: Digest ${authParts.join(', ')}`;

    if (method === 'INVITE') {
      if (activeCall.lastNonce === nonce) return; // Prevent Auth Storm
      activeCall.lastNonce = nonce;

      activeCall.authAttempts = (activeCall.authAttempts || 0) + 1;
      if (activeCall.authAttempts > 3) {
        console.error('[SIP_AUTH] Repeated 401 on INVITE — Check credentials or Realm.');
        if (mainWin) mainWin.webContents.send('sip-incoming', { message: '[AUTH_ERR] Persistent 401 challenge. Check CRM password.' });
        deadCallIds.add(activeCall.callId);
        resetActiveCall();
        return;
      }

      console.log(`[SIP_AUTH] Responding to INVITE challenge...`);
      if (mainWin) mainWin.webContents.send('sip-incoming', { message: `[AUTH] Responding to INVITE challenge (Try ${activeCall.authAttempts})...` });
      const retryPkt = buildPacket('INVITE', {
        callId:  activeCall.callId,
        fromTag: activeCall.fromTag,
        cseq:    activeCall.cseq + 1,
        extraHeaders: [authHdr],
      });
      activeCall.cseq++;
      sendUdp(retryPkt);
    } else {
      if (registerSession.authSent) {
        console.error('[SIP_AUTH] Repeated 401/407 on REGISTER.');
        if (mainWin) mainWin.webContents.send('sip-incoming', { message: '[AUTH FAIL] Wrong password. Check CRM voip_lines.' });
        return;
      }
      registerSession.authSent = true;
      const regPkt = buildPacket('REGISTER', { extraHeaders: [authHdr] });
      sendUdp(regPkt);
    }
    return;
  }

  // --- 487 Request Terminated ---
  if (text.includes('487 Request Terminated')) {
    if (msgCallId === activeCall.callId) {
      console.log('[SIP] Call canceled/terminated.');
      deadCallIds.add(activeCall.callId);
      resetActiveCall();
    }
    return;
  }

  // --- 200 OK ---
  if (text.includes('200 OK')) {
    const contactM = text.match(/^Contact:\s*<([^>]+)>/im);
    const cseqM  = text.match(/CSeq:\s*(\d+)\s+(\w+)/i);
    const method = cseqM ? cseqM[2] : '';
    const cseqNum = cseqM ? parseInt(cseqM[1]) : 1;

    if (method === 'OPTIONS') {
      // FIX BUG 6: OPTIONS success resets ping counters ONLY — does NOT fire sip-registered toast
      consecutivePingFailures = 0;
      optionsPingSentTime = null;
      if (optionsPingTimeout) {
        clearTimeout(optionsPingTimeout);
        optionsPingTimeout = null;
      }
      // Do NOT send sip-registered here — that's only for actual REGISTER success
    }

    if (method === 'REGISTER' && msgCallId === registerSession.callId && !isRegistered) {
      isRegistered = true;
      // FIX BUG 5: Reset authSent so future watchdog re-registrations can respond to 401 challenges
      registerSession.authSent = false;
      console.log('[SIP] ✅ REGISTERED — Agent is ONLINE');
      if (mainWin) mainWin.webContents.send('sip-registered', {});
    }

    if (method === 'INVITE') {
      if (msgCallId !== activeCall.callId) {
        deadCallIds.add(msgCallId);
        console.log(`[SIP_GHOST] Received 200 OK for ghost call ${msgCallId}. Terminating.`);
        const fromTagM = text.match(/^From:.*?;tag=([^\s;]+)/im);
        const fromTag = fromTagM ? fromTagM[1] : '';
        const remoteUri = contactM ? contactM[1] : '';
        const toUriM = text.match(/^To:\s*(?:<)?(sip:[^>;]+)/im);
        const toUri = toUriM ? toUriM[1] : '';

        const ack = [
          `ACK ${remoteUri || toUri} SIP/2.0`,
          `Via: SIP/2.0/UDP ${localIP}:${localPort};branch=z9hG4bK${crypto.randomBytes(8).toString('hex')};rport`,
          `Max-Forwards: 70`,
          `From: "${sipConfig.username}" <sip:${sipConfig.username}@${sipConfig.host}>;tag=${fromTag}`,
          `To: ${toUri};tag=${toTag}`,
          `Call-ID: ${msgCallId}`,
          `CSeq: ${cseqNum} ACK`,
          `Contact: <sip:${sipConfig.username}@${localIP}:${localPort}>`,
          `Content-Length: 0`, '', ''
        ].join('\r\n');
        sendUdp(ack);

        const bye = [
          `BYE ${remoteUri || toUri} SIP/2.0`,
          `Via: SIP/2.0/UDP ${localIP}:${localPort};branch=z9hG4bK${crypto.randomBytes(8).toString('hex')};rport`,
          `Max-Forwards: 70`,
          `From: "${sipConfig.username}" <sip:${sipConfig.username}@${sipConfig.host}>;tag=${fromTag}`,
          `To: ${toUri};tag=${toTag}`,
          `Call-ID: ${msgCallId}`,
          `CSeq: ${cseqNum + 1} BYE`,
          `Contact: <sip:${sipConfig.username}@${localIP}:${localPort}>`,
          `Content-Length: 0`, '', ''
        ].join('\r\n');
        sendUdp(bye);
        return;
      }

      if (activeCall.timeoutHandle) clearTimeout(activeCall.timeoutHandle);

      if (toTag) activeCall.toTag = toTag;
      if (contactM) activeCall.remoteUri = contactM[1];

      sendAck(activeCall.phone, activeCall.callId, activeCall.fromTag, toTag, cseqNum);
      
      if (!activeCall.busy) {
        activeCall.busy = true;

        const mAudio = text.match(/m=audio\s+(\d+)/i);
        const cConn  = text.match(/c=IN\s+IP4\s+([0-9.]+)/i);
        if (mAudio && cConn) {
          activeCall.remoteRtpPort = parseInt(mAudio[1]);
          activeCall.remoteRtpHost = cConn[1];
        } else {
          activeCall.remoteRtpHost = sipConfig.host;
          activeCall.remoteRtpPort = 10000; 
        }

        console.log(`[RTP] Target: ${activeCall.remoteRtpHost}:${activeCall.remoteRtpPort}`);
        startRTP(activeCall.rtpPort);
        if (mainWin) mainWin.webContents.send('sip-answered', {});
      }
    }
    return;
  }

  // --- BYE (call ended by remote) ---
  if (first.startsWith('BYE')) {
    const viaM    = text.match(/^Via:.*$/im);
    const fromM   = text.match(/^From:.*$/im);
    const toM     = text.match(/^To:.*$/im);
    const cseqM   = text.match(/CSeq:\s*(\d+)/i);

    const byeLines = [`SIP/2.0 200 OK`];
    if (viaM) byeLines.push(viaM[0]); else byeLines.push(`Via: SIP/2.0/UDP ${localIP}:${localPort};branch=z9hG4bK${crypto.randomBytes(8).toString('hex')}`);
    if (fromM) byeLines.push(fromM[0]);
    if (toM) byeLines.push(toM[0]);
    byeLines.push(`Call-ID: ${msgCallId}`);
    byeLines.push(`CSeq: ${cseqM ? cseqM[1] : 1} BYE`);
    byeLines.push(`Content-Length: 0`, '', '');
    sendUdp(byeLines.join('\r\n'));

    deadCallIds.add(msgCallId);

    if (msgCallId === activeCall.callId && activeCall.busy) {
      console.log('[SIP] Call ended by remote.');
      resetActiveCall();
      if (mainWin) mainWin.webContents.send('sip-ended', {});
    }
    return;
  }

  // --- 180 Ringing ---
  if (text.includes('180 Ringing') || text.includes('183 Session')) {
    if (msgCallId !== activeCall.callId) return;
    
    // FIX BUG 2: Capture To-tag from 180 Ringing — carrier may omit it from 200 OK
    // This is the critical fix for 481 Transaction Does Not Exist on BYE
    if (toTag && !activeCall.toTag) activeCall.toTag = toTag;

    if (activeCall.lastStatus !== 'ringing') {
      activeCall.lastStatus = 'ringing';
      console.log('[SIP] 📞 Ringing!');
      if (mainWin) mainWin.webContents.send('sip-ringing', {});
    }
  }
});

// ---- IPC: Set SIP Config ----
ipcMain.on('set-sip-config', (_event, config) => {
  let host = (config.domain || config.host || '').trim();
  let port = parseInt(config.port) || 1221;
  if (host.includes(':')) { const [h, p] = host.split(':'); host = h; port = parseInt(p) || port; }

  // FIX BUG 1: Tightened guard — check both credentials match AND auth cycle is complete
  // This prevents duplicate registration timer stacking on every React re-render/sync
  if (sipConfig?.username === config.username && sipConfig?.password === config.password && (isRegistered || (registerSession.callId && registerSession.authSent))) return;

  sipConfig = { username: config.username, password: config.password, host, port };
  isRegistered = false;
  registerSession = { callId: null, fromTag: null, cseq: 0, authSent: false };
  localIP = getLocalIP();
  console.log(`[SIP_CONFIG] Agent: ${sipConfig.username} | Server: ${sipConfig.host}:${sipConfig.port} | Local: ${localIP}:${localPort}`);

  startKeepAlive();
  sendUdp(buildPacket('REGISTER'));
});

// ---- IPC: Send INVITE ----
ipcMain.handle('send-sip-packet', async (_event, payload) => {
  if (!sipConfig) return { error: 'No SIP config. Sync first.' };
  const phone = payload.phone;
  if (!phone) return { error: 'No phone number.' };

  const rtpPort = 10000 + Math.floor(Math.random() * 5000) * 2;
  const sock = dgram.createSocket('udp4');
  sock.bind(rtpPort);
  
  const publicRtpPort = await getPublicPort(sock) || rtpPort;

  activeCall = {
    phone,
    callId:  crypto.randomBytes(8).toString('hex') + '@' + localIP,
    fromTag: crypto.randomBytes(6).toString('hex'),
    cseq: 1,
    rtpPort,
    publicRtpPort,
    rtpSocket: sock,
    remoteRtpHost: null,
    remoteRtpPort: null,
    rtpSeq: Math.floor(Math.random() * 65535),
    rtpTs: Math.floor(Math.random() * 0xFFFFFFFF),
    ssrc: Math.floor(Math.random() * 0xFFFFFFFF),
    busy: false,
    authSent: false,
    lastBranch: null,
    lastStatus: 'calling',
    punchInterval: null,
    timeoutHandle: null,
    pendingOkPacket: null,
    okRetransmitInterval: null,
    ackTimeoutHandle: null
  };

  startRTP(rtpPort, sock);

  console.log(`[SIP_INVITE] Calling: ${phone} (Public RTP Port: ${publicRtpPort})`);
  if (mainWin) mainWin.webContents.send('sip-incoming', { message: `[OUT] INVITE → ${phone} (RTP Port: ${publicRtpPort})` });
  sendUdp(buildPacket('INVITE'));
  
  activeCall.timeoutHandle = setTimeout(() => {
    if (activeCall.lastStatus === 'calling' || activeCall.lastStatus === 'ringing') {
      console.log(`[SIP] Timeout reached, canceling call.`);
      sendUdp(buildPacket('CANCEL', { branch: activeCall.lastBranch, cseq: activeCall.cseq }));
      deadCallIds.add(activeCall.callId);
      resetActiveCall();
    }
  }, 30000);

  return { success: true };
});

// ---- IPC: Send Audio (Microphone) ----
ipcMain.on('send-rtp-audio', (_event, buf) => {
  if (!activeCall.busy || !activeCall.rtpSocket || !activeCall.remoteRtpHost) return;

  const uint8 = new Uint8Array(buf);
  const pcm = new Int16Array(uint8.buffer, uint8.byteOffset, uint8.length / 2);
  const ulaw = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) ulaw[i] = linear2ulaw(pcm[i]);

  const rtp = Buffer.alloc(12 + ulaw.length);
  rtp[0] = 0x80;
  rtp[1] = 0x00;
  rtp.writeUInt16BE(activeCall.rtpSeq++, 2);
  rtp.writeUInt32BE(activeCall.rtpTs, 4);
  rtp.writeUInt32BE(activeCall.ssrc || 0x12345678, 8);
  ulaw.copy(rtp, 12);

  activeCall.rtpTs += ulaw.length;
  activeCall.rtpSocket.send(rtp, activeCall.remoteRtpPort, activeCall.remoteRtpHost);

  const now = Date.now();
  if (now - activeCall.lastMicLog > 2000) {
    activeCall.lastMicLog = now;
    if (mainWin) mainWin.webContents.send('sip-incoming', { message: '[MIC] → Sending Audio Data' });
  }
});

// ---- IPC: Incoming Call Controls ----
ipcMain.handle('answer-incoming', () => {
  if (activeCall.lastStatus === 'answered-awaiting-ack' || activeCall.lastStatus === 'active') {
    return { error: 'Already answering' };
  }
  if (activeCall.lastStatus !== 'incoming-ringing' || !activeCall.incomingReq) return { error: 'No incoming call' };

  const ipToUse = publicIp || localIP;
  const sdp = [
    `v=0`,
    `o=${sipConfig.username} ${Date.now()} ${Date.now()} IN IP4 ${ipToUse}`,
    `s=MAOS Elite`,
    `c=IN IP4 ${ipToUse}`,
    `t=0 0`,
    `m=audio ${activeCall.rtpPort} RTP/AVP 0 8 101`,
    `a=rtpmap:0 PCMU/8000`,
    `a=rtpmap:8 PCMA/8000`,
    `a=rtpmap:101 telephone-event/8000`,
    `a=fmtp:101 0-15`,
    `a=sendrecv`,
    `a=direction:sendrecv`,
    `a=rtcp-mux`,
    ``
  ].join('\r\n');

  const okLines = [`SIP/2.0 200 OK`];
  const req = activeCall.incomingReq;
  if (req.via) okLines.push(req.via);
  if (req.from) okLines.push(req.from);
  if (req.to) okLines.push(req.to);
  okLines.push(`Call-ID: ${activeCall.callId}`);
  okLines.push(`CSeq: ${req.cseq} INVITE`);
  okLines.push(`Contact: <sip:${sipConfig.username}@${ipToUse}:${localPort}>`);
  okLines.push(`Content-Type: application/sdp`);
  okLines.push(`Content-Length: ${Buffer.byteLength(sdp)}`);
  okLines.push('', sdp);

  const okPacket = okLines.join('\r\n');
  sendUdp(okPacket);
  activeCall.pendingOkPacket = okPacket;

  const intervals = [500, 1000, 2000, 4000];
  let nextIdx = 0;
  
  const scheduleRetransmit = () => {
    if (nextIdx >= intervals.length || !activeCall.pendingOkPacket) return;
    activeCall.okRetransmitInterval = setTimeout(() => {
      if (activeCall.pendingOkPacket) {
        console.log(`[SIP] Retransmitting 200 OK (Attempt ${nextIdx + 1})...`);
        sendUdp(activeCall.pendingOkPacket);
        nextIdx++;
        scheduleRetransmit();
      }
    }, intervals[nextIdx]);
  };
  scheduleRetransmit();

  activeCall.ackTimeoutHandle = setTimeout(() => {
    console.log('[SIP] ACK timeout — inbound call abandoned');
    if (activeCall.okRetransmitInterval) clearTimeout(activeCall.okRetransmitInterval);
    resetActiveCall();
    if (mainWin) mainWin.webContents.send('sip-ended', {});
  }, 4000);

  console.log('[SIP] 200 OK sent. Waiting for ACK before starting RTP...');
  activeCall.busy = true;
  activeCall.lastStatus = 'answered-awaiting-ack';
  return { success: true };
});

ipcMain.handle('decline-incoming', () => {
  if (activeCall.lastStatus !== 'incoming-ringing' || !activeCall.incomingReq) return { error: 'No incoming call' };
  
  const req = activeCall.incomingReq;
  const decLines = [`SIP/2.0 603 Decline`];
  if (req.via) decLines.push(req.via);
  if (req.from) decLines.push(req.from);
  if (req.to) decLines.push(req.to);
  decLines.push(`Call-ID: ${activeCall.callId}`);
  decLines.push(`CSeq: ${req.cseq} INVITE`);
  decLines.push(`Content-Length: 0`, '', '');
  
  sendUdp(decLines.join('\r\n'));
  resetActiveCall();
  return { success: true };
});

// ---- IPC: Hang Up ----
ipcMain.on('window-hangup', () => {
  if (!activeCall.phone || !activeCall.callId) return;
  
  if (activeCall.lastStatus === 'calling' || activeCall.lastStatus === 'ringing') {
    console.log(`[SIP_CANCEL] Canceling call: ${activeCall.phone}`);
    sendUdp(buildPacket('CANCEL', { branch: activeCall.lastBranch, cseq: activeCall.cseq }));
  } else {
    console.log(`[SIP_BYE] Hanging up: ${activeCall.phone}`);
    sendUdp(buildPacket('BYE'));
  }

  deadCallIds.add(activeCall.callId); 
  resetActiveCall();
});


// ---- IPC: DTMF Tones ----
function buildDtmfPacket(digit, sequence, timestamp, ssrc, phase) {
  let event = 0;
  if (digit >= '0' && digit <= '9') {
    event = parseInt(digit);
  } else if (digit === '*') {
    event = 10;
  } else if (digit === '#') {
    event = 11;
  }

  const packet = Buffer.alloc(16);
  
  packet[0] = 0x80;
  packet[1] = 101;
  packet.writeUInt16BE(sequence, 2);
  packet.writeUInt32BE(timestamp, 4);
  packet.writeUInt32BE(ssrc, 8);

  packet[12] = event;
  
  let volume = 10; 
  let duration = 160;
  let endBit = 0;

  if (phase === 1) {
    endBit = 0;
    duration = 160;
  } else if (phase === 2) {
    endBit = 0;
    duration = 320;
  } else if (phase === 3) {
    endBit = 1;
    duration = 480;
  }

  packet[13] = (endBit ? 0x80 : 0x00) | (volume & 0x3F);
  packet.writeUInt16BE(duration, 14);

  return packet;
}

ipcMain.on('send-sip-dtmf', (_event, digit) => {
  if (!activeCall.busy || !activeCall.rtpSocket || !activeCall.remoteRtpHost) return;
  
  const seqBase = activeCall.rtpSeq;
  activeCall.rtpSeq += 3;
  const timestamp = activeCall.rtpTs;
  
  const p1 = buildDtmfPacket(digit, seqBase, timestamp, activeCall.ssrc, 1);
  try { activeCall.rtpSocket.send(p1, activeCall.remoteRtpPort, activeCall.remoteRtpHost); } catch (e) {}

  setTimeout(() => {
    if (!activeCall.busy || !activeCall.rtpSocket) return;
    const p2 = buildDtmfPacket(digit, seqBase + 1, timestamp, activeCall.ssrc, 2);
    try { activeCall.rtpSocket.send(p2, activeCall.remoteRtpPort, activeCall.remoteRtpHost); } catch (e) {}
  }, 20);

  setTimeout(() => {
    if (!activeCall.busy || !activeCall.rtpSocket) return;
    const p3 = buildDtmfPacket(digit, seqBase + 2, timestamp, activeCall.ssrc, 3);
    try { activeCall.rtpSocket.send(p3, activeCall.remoteRtpPort, activeCall.remoteRtpHost); } catch (e) {}
  }, 40);
});


// ---- IPC: Voicemail Drop ----
function writeWav(filePath, pcmBuffer) {
  const header = Buffer.alloc(44);
  const dataLength = pcmBuffer.length;
  const fileLength = dataLength + 36;
  
  header.write('RIFF', 0);
  header.writeUInt32LE(fileLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  const fileBuffer = Buffer.concat([header, pcmBuffer]);
  fs.writeFileSync(filePath, fileBuffer);
}

ipcMain.handle('get-voicemail-path', () => {
  return path.join(app.getPath('userData'), 'voicemail.wav');
});

ipcMain.on('save-voicemail', (_event, pcmBuffer) => {
  const vmPath = path.join(app.getPath('userData'), 'voicemail.wav');
  try {
    writeWav(vmPath, pcmBuffer);
    console.log('[VM] Voicemail saved successfully to:', vmPath);
  } catch (err) {
    console.error('[VM] Error saving voicemail:', err.message);
  }
});

ipcMain.on('drop-voicemail', async () => {
  if (!activeCall.busy || !activeCall.rtpSocket || !activeCall.remoteRtpHost) return;
  const vmPath = path.join(app.getPath('userData'), 'voicemail.wav');
  
  try {
    const data = await fs.promises.readFile(vmPath);
    const pcmData = data.slice(44);
    
    let offset = 0;
    const chunkSize = 320; 
    
    const intervalId = setInterval(() => {
      if (!activeCall.busy || !activeCall.rtpSocket || offset >= pcmData.length) {
        clearInterval(intervalId);
        
        if (offset >= pcmData.length) {
          console.log('[VM] Voicemail file ended. Sending BYE.');
          sendUdp(buildPacket('BYE'));
          deadCallIds.add(activeCall.callId); 
          resetActiveCall();
        }
        return;
      }
      
      const chunk = pcmData.slice(offset, offset + chunkSize);
      offset += chunkSize;
      
      const pcm = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);
      const ulaw = Buffer.alloc(pcm.length);
      for (let i = 0; i < pcm.length; i++) ulaw[i] = linear2ulaw(pcm[i]);
      
      const rtp = Buffer.alloc(12 + ulaw.length);
      rtp[0] = 0x80;
      rtp[1] = 0x00;
      rtp.writeUInt16BE(activeCall.rtpSeq++, 2);
      rtp.writeUInt32BE(activeCall.rtpTs, 4);
      rtp.writeUInt32BE(activeCall.ssrc || 0x12345678, 8);
      ulaw.copy(rtp, 12);
      
      activeCall.rtpTs += ulaw.length;
      try { activeCall.rtpSocket.send(rtp, activeCall.remoteRtpPort, activeCall.remoteRtpHost); } catch (e) {}
    }, 20);
    
  } catch (err) {
    console.error('[VM] Error playing voicemail:', err.message);
  }
});


// ---- Window ----
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1000, minHeight: 700,
    frame: false, backgroundColor: '#050505', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  isDev ? mainWin.loadURL('http://localhost:5174') : mainWin.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWin.once('ready-to-show', () => { mainWin.show(); console.log('[ELITE_LAUNCH] System Online.'); });
  mainWin.on('maximize',   () => { if (mainWin) mainWin.webContents.send('window-maximize-status', true); });
  mainWin.on('unmaximize', () => { if (mainWin) mainWin.webContents.send('window-maximize-status', false); });
  mainWin.on('closed', () => { mainWin = null; });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(true));

  publicIp = await discoverPublicIp();
  if (publicIp) {
    console.log(`[NAT] STUN Discovered Public IP: ${publicIp}`);
  } else {
    console.warn(`[NAT] STUN Failed. Falling back to Local IP: ${localIP}`);
  }

  createWindow();
  if (mainWin) mainWin.webContents.send('sip-incoming', { message: '[SYSTEM] Main Process Online' });

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(e => console.error('[UPDATE_ERR]', e.message));
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(e => console.error('[UPDATE_ERR]', e.message));
    }, 60 * 60 * 1000);
  }
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({ type: 'info', title: 'Update Ready', message: 'New version ready. Update now?', buttons: ['Update Now', 'Later'] })
    .then(r => { if (r.response === 0) autoUpdater.quitAndInstall(); })
    .catch(e => console.error('[DIALOG_ERR]', e.message));
});

ipcMain.on('window-minimize', () => { if (mainWin) mainWin.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWin) {
    if (mainWin.isMaximized()) {
      mainWin.unmaximize();
    } else {
      mainWin.maximize();
    }
  }
});
ipcMain.on('window-close',    () => { if (mainWin) mainWin.close(); });

app.on('window-all-closed', () => {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  if (reRegisterInterval) clearInterval(reRegisterInterval);
  if (optionsPingInterval) clearInterval(optionsPingInterval);
  if (optionsPingTimeout) clearTimeout(optionsPingTimeout);
  safeClose(udpSocket);
  if (process.platform !== 'darwin') app.quit();
});
