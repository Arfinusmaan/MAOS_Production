const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:        ()    => ipcRenderer.send('window-minimize'),
  maximize:        ()    => ipcRenderer.send('window-maximize'),
  close:           ()    => ipcRenderer.send('window-close'),
  onMaximizeStatus: (cb) => { ipcRenderer.removeAllListeners('window-maximize-status'); ipcRenderer.on('window-maximize-status', (_e, v) => cb(v)); },
  hangup:          ()    => ipcRenderer.send('window-hangup'),
  setSipConfig:    (c)   => ipcRenderer.send('set-sip-config', c),
  sendSipPacket:   (p)   => ipcRenderer.invoke('send-sip-packet', p),
  sendRtpAudio:    (buf) => ipcRenderer.send('send-rtp-audio', buf),
  
  onSipIncoming:   (cb)  => { ipcRenderer.removeAllListeners('sip-incoming'); ipcRenderer.on('sip-incoming', (_e, v) => cb(v)); },
  onSipRegistered: (cb)  => { ipcRenderer.removeAllListeners('sip-registered'); ipcRenderer.on('sip-registered', (_e, v) => cb(v)); },
  onSipAnswered:   (cb)  => { ipcRenderer.removeAllListeners('sip-answered'); ipcRenderer.on('sip-answered', (_e, v) => cb(v)); },
  onSipRinging:    (cb)  => { ipcRenderer.removeAllListeners('sip-ringing'); ipcRenderer.on('sip-ringing', (_e, v) => cb(v)); },
  onSipEnded:      (cb)  => { ipcRenderer.removeAllListeners('sip-ended'); ipcRenderer.on('sip-ended', (_e, v) => cb(v)); },
  onRtpAudio:      (cb)  => { ipcRenderer.removeAllListeners('rtp-audio'); ipcRenderer.on('rtp-audio', (_e, v) => cb(v)); },
  onSipIncomingCall: (cb) => { ipcRenderer.removeAllListeners('sip-incoming-call'); ipcRenderer.on('sip-incoming-call', (_e, v) => cb(v)); },
  
  onSipOffline:    (cb)  => { ipcRenderer.removeAllListeners('sip-offline'); ipcRenderer.on('sip-offline', (_e, v) => cb(v)); },
  sendDtmf:        (digit) => ipcRenderer.send('send-sip-dtmf', digit),
  dropVoicemail:   ()    => ipcRenderer.send('drop-voicemail'),
  saveVoicemail:   (buf) => ipcRenderer.send('save-voicemail', buf),
  
  answerIncoming:  ()    => ipcRenderer.invoke('answer-incoming'),
  declineIncoming: ()    => ipcRenderer.invoke('decline-incoming'),
});
