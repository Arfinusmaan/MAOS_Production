import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { 
  Phone, 
  PhoneOff, 
  PhoneOutgoing, 
  User, 
  Mail, 
  Building2, 
  MapPin, 
  ChevronRight, 
  ChevronLeft, 
  FileSpreadsheet, 
  Plus, 
  Settings, 
  LogOut, 
  Shield, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Play, 
  Pause, 
  RefreshCcw, 
  Target, 
  SignalHigh, 
  X, 
  Minus, 
  Eye, 
  X as CloseIcon,
  Globe, 
  History, 
  ShieldCheck, 
  Activity, 
  Loader2, 
  Flag, 
  Timer,
  Zap,
  Mic,
  LayoutGrid
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { saveCall, getCallHistory } from './callHistory';

declare global {
  interface Window {
    electronAPI: any;
  }
}

// Local note draft database helper
const NOTES_DB_NAME = 'maos_elite_notes';
const NOTES_STORE_NAME = 'note_drafts';

function openNotesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTES_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES_STORE_NAME)) {
        db.createObjectStore(NOTES_STORE_NAME, { keyPath: 'leadId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveNotesDraft(leadId: string, notes: string) {
  try {
    const db = await openNotesDB();
    const tx = db.transaction(NOTES_STORE_NAME, 'readwrite');
    const store = tx.objectStore(NOTES_STORE_NAME);
    store.put({ leadId, notes, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[NOTES_DB_ERR]', err);
  }
}

async function loadNotesDraft(leadId: string): Promise<string> {
  try {
    const db = await openNotesDB();
    return new Promise((resolve) => {
      const tx = db.transaction(NOTES_STORE_NAME, 'readonly');
      const store = tx.objectStore(NOTES_STORE_NAME);
      const request = store.get(leadId);
      request.onsuccess = () => resolve(request.result?.notes || '');
      request.onerror = () => resolve('');
    });
  } catch (err) {
    console.error('[NOTES_DB_ERR]', err);
    return '';
  }
}

async function deleteNotesDraft(leadId: string) {
  try {
    const db = await openNotesDB();
    const tx = db.transaction(NOTES_STORE_NAME, 'readwrite');
    const store = tx.objectStore(NOTES_STORE_NAME);
    store.delete(leadId);
  } catch (err) {
    console.error('[NOTES_DB_ERR]', err);
  }
}

export default function App() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [agentEmail, setAgentEmail] = useState('');
  const [agentName, setAgentName] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<'idle' | 'calling' | 'active' | 'post-call' | 'incoming'>('idle');
  const [isAutoDialing, setIsAutoDialing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [callTimer, setCallTimer] = useState(0);
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [currentCampaign, setCurrentCampaign] = useState<any>(null);
  const [view, setView] = useState<'mission' | 'manual' | 'history'>('mission');
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [manualNumber, setManualNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [telemetry, setTelemetry] = useState<string[]>(['Signal Telemetry Ready...']);
  const [ringingTime, setRingingTime] = useState(0);
  const [assignedLine, setAssignedLine] = useState<any>(null);
  const [agentLeads, setAgentLeads] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<any[]>([]);  // full list including called
  const [dailyStats, setDailyStats] = useState({ calls: 0, booked: 0, talkTime: 0 });
  const [voipStatus, setVoipStatus] = useState<'offline' | 'searching' | 'secure'>('searching');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakerLevel, setSpeakerLevel] = useState(0);
  const speakerLevelCounterRef = useRef(0);
  const [showLeadsList, setShowLeadsList] = useState(false);
  const [leadsListSearch, setLeadsListSearch] = useState('');
  
  // Hardware
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('default');
  const [micAuthorized, setMicAuthorized] = useState(false);
  
  const timerRef = useRef<any>(null);
  const countdownRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneRef = useRef<OscillatorNode | null>(null);
  const hasLoaded = useRef(false); // prevent double-load
  const ringingRef = useRef(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micScriptRef = useRef<ScriptProcessorNode | null>(null);
  const isMutedRef = useRef(false);
  const rtpAudioCtxRef = useRef<AudioContext | null>(null);
  const rtpNextPlayTimeRef = useRef(0);
  const currentIncomingPhoneRef = useRef<string | null>(null);

  // New guard, watchdog & redial refs/states
  const isAnsweringRef = useRef(false);
  const [redialCount, setRedialCount] = useState(0);
  const redialTimerRef = useRef<any>(null);
  const MAX_REDIALS = 3;
  const REDIAL_DELAY = 10000;

  // New presence refs/states
  const statusRef = useRef('offline');
  const agentEmailRef = useRef('');
  const currentLeadRef = useRef<any>(null);

  // New notes save refs/states
  const notesRef = useRef('');
  const notesSaveTimerRef = useRef<any>(null);
  const notesLeadIdRef = useRef<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [showDraftSaved, setShowDraftSaved] = useState(false);

  // New DNC set ref
  const dncSetRef = useRef<Set<string>>(new Set());

  // New voicemail setup state/refs
  const [showVmModal, setShowVmModal] = useState(false);
  const [isRecordingVm, setIsRecordingVm] = useState(false);
  const [recordedPcm, setRecordedPcm] = useState<Int16Array | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const vmRecorderRef = useRef<{
    context: AudioContext;
    stream: MediaStream;
    processor: ScriptProcessorNode;
    pcmData: number[];
  } | null>(null);
  const [isVmDropping, setIsVmDropping] = useState(false);

  // Mic throttle counter ref
  const micLevelCounterRef = useRef(0);

  // Keep refs synchronized
  useEffect(() => {
    agentEmailRef.current = agentEmail;
  }, [agentEmail]);

  useEffect(() => {
    currentLeadRef.current = currentLead;
  }, [currentLead]);

  const updateAgentStatus = async (newStatus: string) => {
    if (!agentEmailRef.current) return;
    statusRef.current = newStatus;
    try {
      await supabase.from('agent_status').upsert({
        email: agentEmailRef.current,
        status: newStatus,
        last_heartbeat: new Date().toISOString(),
        active_lead_id: currentLeadRef.current?.id || null
      }, { onConflict: 'email' });
      console.log(`[STATUS] Updated agent status to: ${newStatus}`);
    } catch (err: any) {
      console.error('[STATUS] Error updating status:', err.message);
    }
  };

  // Heartbeat loop
  useEffect(() => {
    let heartbeatInterval: any;
    if (isLoggedIn && agentEmail) {
      heartbeatInterval = setInterval(() => {
        updateAgentStatus(statusRef.current);
      }, 15000);
    }
    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [isLoggedIn, agentEmail]);

  // Synchronous page unload handler for presence state consistency
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (agentEmailRef.current) {
        const xhr = new XMLHttpRequest();
        const url = `https://stwpdjjpdfnxvvqxreny.supabase.co/rest/v1/agent_status?email=eq.${agentEmailRef.current}`;
        xhr.open('PATCH', url, false); 
        xhr.setRequestHeader('apikey', 'sb_publishable_fB8h7Xbi1TzqBJoWP1ztzw_DzWuvMHO');
        xhr.setRequestHeader('Authorization', 'Bearer sb_publishable_fB8h7Xbi1TzqBJoWP1ztzw_DzWuvMHO');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({
          status: 'offline',
          last_heartbeat: new Date().toISOString()
        }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Notes draft restorer when currentLead changes
  useEffect(() => {
    if (currentLead) {
      notesLeadIdRef.current = currentLead.id;
      loadNotesDraft(currentLead.id).then(draft => {
        setNotesValue(draft);
        notesRef.current = draft;
      });
    } else {
      notesLeadIdRef.current = null;
      setNotesValue('');
      notesRef.current = '';
    }
  }, [currentLead]);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      if (hasLoaded.current) return; // already loaded
      hasLoaded.current = true;
      const email = session.user.email!;
      const name = email.split('@')[0] || 'Operator';
      setIsLoggedIn(true);
      setAgentName(name);
      setAgentEmail(email);
      setUserId(session.user.id);
      loadAgentWorld(email);
      
      // Subscribe to SIP Telemetry (Electron only)
      if (isElectron) {
        window.electronAPI.onSipIncoming((data: any) => {
          const msg = data.message;
          const trimmed = msg.trim();
          if (!trimmed) return;

          const firstLine = trimmed.split('\r\n')[0] || trimmed.split('\n')[0];
          
          const isSdp = ['SDP', 'v=0', 'o=', 'm=audio', 'a=rtpmap'].some(term => trimmed.includes(term));
          
          // FIX BUG 4: Filter routine 401 Unauthorized from agent UI — it is normal SIP auth
          // handshake behavior (send unauthenticated → get 401 → retry with credentials).
          // Only show 401 if main process has tagged it AUTH_ERR (persistent failure after 3 attempts).
          const isRoutine401 = firstLine.includes('401 Unauthorized') && !trimmed.includes('AUTH_ERR');
          
          if (!isSdp && !isRoutine401 && !firstLine.includes('180 Ringing') && !firstLine.includes('183 Session') && !firstLine.includes('200 OK')) {
            setTelemetry(prev => [`[IN] ${firstLine}`, ...prev].slice(0, 30));
          }
          
          if (msg.includes('486 Busy Here') || msg.includes('603 Decline')) {
            handleSignalFailure('Line Engaged / Declined');
          } else if (msg.includes('480') || msg.includes('408')) {
            handleSignalFailure('No Answer / Timeout');
          }
        });

        window.electronAPI.onSipRegistered(() => {
          setVoipStatus('secure');
          setTelemetry(prev => ['[REG] ✅ Registered — You are ONLINE', ...prev].slice(0, 30));
          toast.success('VoIP Online! Ready to dial.');
        });

        window.electronAPI.onSipOffline(() => {
          setVoipStatus('offline');
          setTelemetry(prev => ['[⚠️] Registration lost — reconnecting...', ...prev].slice(0, 30));
          toast.error('VoIP connection lost. Reconnecting...');
        });

        window.electronAPI.onSipRinging(() => {
          if (!ringingRef.current) {
            ringingRef.current = true;
            startRinging(); // Only start the tone when the server confirms ringing
            setTelemetry(prev => ['[📞] Phone is ringing...', ...prev].slice(0, 30));
            toast.info('📞 Ringing...');
          }
        });

        window.electronAPI.onSipIncomingCall((data: any) => {
          setStatus('incoming');
          startRinging();
          currentIncomingPhoneRef.current = data.phone;
          setTelemetry(prev => [`[📞] Incoming call from ${data.phone}`, ...prev].slice(0, 30));
          toast.info(`Incoming Call from ${data.phone}`);
          saveCall({ callerId: data.phone, direction: 'inbound', disposition: 'missed' });
        });

        window.electronAPI.onSipAnswered(() => {
          isAnsweringRef.current = false;
          ringingRef.current = false;
          stopRinging();
          setStatus('active');
          setCallTimer(0);
          setRedialCount(0); 
          startMic();
          updateAgentStatus('on-call');
          setTelemetry(prev => ['[✅] Call Answered!', ...prev].slice(0, 30));
          toast.success('Call Active');
          
          if (currentIncomingPhoneRef.current) {
            saveCall({ 
              callerId: currentIncomingPhoneRef.current, 
              direction: 'inbound', 
              disposition: 'answered' 
            });
            currentIncomingPhoneRef.current = null;
          }
        });

        window.electronAPI.onSipEnded(() => {
          isAnsweringRef.current = false;
          ringingRef.current = false;
          setIsVmDropping(false);
          stopRinging();
          stopMic();
          setStatus('post-call');
          setCallTimer(0);
          updateAgentStatus('post-call');
          setTelemetry(prev => ['[BYE] Call Terminated.', ...prev].slice(0, 30));
          toast.info('Call ended.');
        });

        window.electronAPI.onRtpAudio((buf: ArrayBuffer) => {
          if (!rtpAudioCtxRef.current) {
            rtpAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            rtpNextPlayTimeRef.current = rtpAudioCtxRef.current.currentTime;
          }
          if (rtpAudioCtxRef.current.state === 'suspended') rtpAudioCtxRef.current.resume();
          
          const uint8 = new Uint8Array(buf);
          const pcm = new Int16Array(uint8.buffer, uint8.byteOffset, uint8.length / 2);
          const abuf = rtpAudioCtxRef.current.createBuffer(1, pcm.length, 8000);
          const ch = abuf.getChannelData(0);
          let rmsSum = 0;
          for (let i = 0; i < pcm.length; i++) {
            ch[i] = pcm[i] / 32768;
            rmsSum += Math.abs(ch[i]);
          }
          // Throttle speaker level updates — every 4 RTP packets (~80ms at 20ms intervals)
          speakerLevelCounterRef.current++;
          if (speakerLevelCounterRef.current % 4 === 0) {
            const rmsLevel = Math.min(100, Math.round((rmsSum / pcm.length) * 300));
            setSpeakerLevel(rmsLevel);
          }
          
          const src = rtpAudioCtxRef.current.createBufferSource();
          const filter = rtpAudioCtxRef.current.createBiquadFilter();
          const compressor = rtpAudioCtxRef.current.createDynamicsCompressor();
          
          filter.type = 'lowpass';
          filter.frequency.value = 3400; // SIP voice band limit
          
          src.buffer = abuf;
          src.connect(filter);
          filter.connect(compressor);
          compressor.connect(rtpAudioCtxRef.current.destination);
          
          const now = rtpAudioCtxRef.current.currentTime;
          if (rtpNextPlayTimeRef.current < now) rtpNextPlayTimeRef.current = now + 0.02; // Initial 20ms jitter buffer
          else if (rtpNextPlayTimeRef.current > now + 0.1) rtpNextPlayTimeRef.current = now + 0.05; // Fix Issue A: Stabilize Jitter Buffer
          
          src.start(rtpNextPlayTimeRef.current);
          rtpNextPlayTimeRef.current += abuf.duration;
        });

      } else {
        setVoipStatus('secure');
        setTelemetry(['[DEV] Browser mode — Electron not detected. SIP disabled.']);
      }
    }
  };

  const startMic = async () => {
    try {
      if (micStreamRef.current) return; // Already running
      const constraints: any = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: selectedMic !== 'default' ? { exact: selectedMic } : undefined
        }
      };
      micStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      micContextRef.current = new AudioContext();
      if (micContextRef.current.state === 'suspended') {
        await micContextRef.current.resume();
      }

      const source = micContextRef.current.createMediaStreamSource(micStreamRef.current);
      micScriptRef.current = micContextRef.current.createScriptProcessor(256, 1, 1);

      source.connect(micScriptRef.current);
      micScriptRef.current.connect(micContextRef.current.destination);

      micScriptRef.current.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!isElectron) return;
        if (isMutedRef.current) return; // Physical mute
        const input = e.inputBuffer.getChannelData(0);
        const sourceRate = micContextRef.current?.sampleRate || 48000;
        const targetRate = 8000;

        let downsampled: Float32Array;
        if (sourceRate === targetRate) {
          downsampled = input;
        } else {
          const ratio = sourceRate / targetRate;
          downsampled = new Float32Array(Math.floor(input.length / ratio));
          for (let i = 0; i < downsampled.length; i++) {
            const start = Math.floor(i * ratio);
            const end = Math.min(Math.floor((i + 1) * ratio), input.length);
            let sum = 0;
            for (let j = start; j < end; j++) sum += input[j];
            downsampled[i] = sum / (end - start);
          }
        }

        const pcm = new Int16Array(downsampled.length);
        let sum = 0;
        for (let i = 0; i < downsampled.length; i++) {
          const s = Math.max(-1, Math.min(1, downsampled[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          sum += Math.abs(s);
        }
        if (window.electronAPI) window.electronAPI.sendRtpAudio(pcm.buffer);
        
        micLevelCounterRef.current++;
        if (micLevelCounterRef.current % 5 === 0) {
          setMicLevel(Math.round((sum / downsampled.length) * 100));
        }
      };
    } catch (err: any) {
      console.error('[MIC_ERR]', err);
      toast.error(`Mic Blocked: ${err.message || 'Check Windows Privacy Settings'}`);
    }
  };

  const stopMic = () => {
    if (micScriptRef.current) {
      // FIX BUG 7: Kill onaudioprocess before disconnect to prevent ghost callbacks on rapid redial
      micScriptRef.current.onaudioprocess = null;
      micScriptRef.current.disconnect();
      micScriptRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micContextRef.current) {
      micContextRef.current.close();
      micContextRef.current = null;
    }
    if (rtpAudioCtxRef.current) {
      try {
        rtpAudioCtxRef.current.close();
      } catch (e) {}
      rtpAudioCtxRef.current = null;
    }
    setMicLevel(0);
    setSpeakerLevel(0);
    speakerLevelCounterRef.current = 0;
  };

  const handleHangup = () => {
    stopMic();
    if (rtpAudioCtxRef.current && rtpAudioCtxRef.current.state !== 'closed') {
      try {
        rtpAudioCtxRef.current.close();
      } catch (e) {}
    }
    rtpAudioCtxRef.current = null;
    rtpNextPlayTimeRef.current = 0;
    stopRinging();

    if (isElectron) {
      window.electronAPI.hangup();
    } else {
      setStatus('post-call');
      setCallTimer(0);
    }
  };

  const handleSignalFailure = (reason: string) => {
    stopRinging();
    setRingingTime(0);

    const busyCodes = ['Line Engaged', 'No Answer', 'Timeout'];
    const shouldRedial = busyCodes.some(c => reason.includes(c));

    if (shouldRedial && redialCount < MAX_REDIALS && currentLeadRef.current) {
      setRedialCount(prev => prev + 1);
      setStatus('calling'); 
      setTelemetry(prev => [
        `[REDIAL] ${reason} — Retry ${redialCount + 1}/${MAX_REDIALS} in 10s`,
        ...prev
      ].slice(0, 30));
      toast.warning(`Busy — Retrying in 10s (${redialCount + 1}/${MAX_REDIALS})`);

      if (redialTimerRef.current) clearTimeout(redialTimerRef.current);
      redialTimerRef.current = setTimeout(() => {
        handleInitiateCall();
      }, REDIAL_DELAY);
      return;
    }

    clearTimeout(redialTimerRef.current);
    setRedialCount(0);
    setStatus('post-call');
    toast.error(`Signal Refused: ${reason}`);
    setTelemetry(prev => [`[SIGNAL] Terminated: ${reason}`, ...prev].slice(0, 30));
  };

  const handleSignalSuccess = () => {
    stopRinging();
    setStatus('active');
    setCallTimer(0);
    setRingingTime(0);
    setRedialCount(0); 
    toast.success("Signal Established.");
  };

  // --- THE SIGNAL WATCHDOG ---
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
    }).catch(e => console.error('[MIC_ENUM_ERR]', e));

    let interval: any;
    if (status === 'calling') {
      interval = setInterval(() => {
        setRingingTime(prev => {
          if (prev >= 20) {
            handleSignalFailure('No Answer (Timeout)');
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRingingTime(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  const handleLogout = async () => {
    await updateAgentStatus('offline');
    setIsLoggedIn(false);
    setAgentLeads([]);
    setCurrentLead(null);
    await supabase.auth.signOut();
  };

  const loadAgentWorld = async (email: string) => {
    setIsLoading(true);
    try {
      // Load DNC numbers
      try {
        const { data: dncData } = await supabase.from('dnc_list').select('phone_number');
        if (dncData) {
          dncSetRef.current = new Set(dncData.map(r => r.phone_number.replace(/\s+/g, '')));
        }
      } catch (e) {
        console.warn('[DNC] Table dnc_list might not exist yet.');
      }

      // Fetch VoIP Line
      const { data: personalLine } = await supabase.from('voip_lines').select('*').eq('assigned_agent_email', email).maybeSingle();
      
      // Fetch Campaign
      let { data: campaign } = await supabase.from('campaigns').select('*').eq('assignee_email', email).limit(1).maybeSingle();
      if (!campaign) {
        const { data: shared } = await supabase.from('campaigns').select('*').eq('assignment_type', 'shared').limit(1).maybeSingle();
        campaign = shared;
      }

      if (campaign) {
        setCurrentCampaign(campaign);
        
        // Fetch Leads for this campaign (uncalled first)
        const { data: leads, error: leadsErr } = await supabase
          .from('leads')
          .select('*')
          .eq('campaign_id', campaign.id)
          .is('last_called_at', null)
          .order('id', { ascending: true });

        if (leadsErr) console.error('[LEADS_ERR]', leadsErr.message);

        // Also load full manifest
        const { data: allLeadsData } = await supabase
          .from('leads')
          .select('id, first_name, phone, status, last_called_at')
          .eq('campaign_id', campaign.id)
          .order('id', { ascending: true });
        setAllLeads(allLeadsData || []);

        if (leads && leads.length > 0) {
          setAgentLeads(leads);
          setCurrentLead(leads[0]);
        } else {
          toast.info(`No uncalled leads. ${allLeadsData?.length || 0} total leads in campaign.`);
        }

        // Set Line (Personal > Campaign)
        const line = personalLine || (campaign.voip_line_id
          ? (await supabase.from('voip_lines').select('*').eq('id', campaign.voip_line_id).maybeSingle()).data
          : null);

        if (line) {
          setAssignedLine(line);
          setTelemetry(prev => [`[SIP] Connecting to ${line.domain}...`, ...prev].slice(0, 30));
          if (isElectron) {
            window.electronAPI.setSipConfig({
              username: line.username,
              password: line.password,
              domain:   line.domain,
              port:     line.port || 1221
            });
          }
          setVoipStatus(isElectron ? 'searching' : 'secure');
        } else {
          toast.error('No VoIP line found. Add one in the CRM.');
          setVoipStatus('offline');
        }
      } else {
        toast.info('No mission assigned to your account.');
      }
      
      await updateAgentStatus('available');
    } catch (err: any) {
      console.error('[LOAD_WORLD_ERROR]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAutoDialing && status === 'idle' && currentLead) {
      setCountdown(3);
      let cancelled = false;
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            if (!cancelled) {
              setStatus(currentStatus => {
                if (currentStatus === 'idle') {
                  handleInitiateCall();
                }
                return currentStatus;
              });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        cancelled = true;
        clearInterval(countdownRef.current);
      };
    }
  }, [isAutoDialing, status, currentLead]);

  useEffect(() => {
    if (status === 'active') {
      timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => { clearInterval(timerRef.current); };
  }, [status]);

  const requestMicAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.getTracks().forEach(t => t.stop()); // Instantly close, we just wanted permission
      setMicAuthorized(true);
      toast.success("Microphone Authorized!");
      
      // Refresh device list to get proper names now that we have permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
    } catch (err: any) {
      console.error(err);
      toast.error(`Mic Blocked: ${err.message}`);
    }
  };

  const handleInitiateCall = (targetNum?: string) => {
    let phone = targetNum || currentLead?.phone;
    if (!phone) {
      toast.error('No target number.');
      return;
    }

    // Keep only digits and '+'
    phone = phone.replace(/[^\d+]/g, '');

    const normalizedPhone = phone;
    if (dncSetRef.current.has(normalizedPhone)) {
      toast.error('DNC: This number is on the Do Not Call list');
      setTelemetry(prev => [`[DNC] BLOCKED: ${phone}`, ...prev].slice(0, 30));
      if (isAutoDialing) {
        handleStatusSubmit('DNC');
      }
      return;
    }

    if (!assignedLine) {
      toast.error('No VoIP line. Sync mission first.');
      return;
    }

    // Auto-prefix country code for manual dials
    if (targetNum && !phone.startsWith('+')) {
      phone = countryCode + phone;
    }

    setStatus('calling');
    setRingingTime(0);
    updateAgentStatus('on-call');
    setTelemetry(prev => [`[OUT] INVITE → ${phone}`, ...prev].slice(0, 30));

    if (isElectron) {
      window.electronAPI.sendSipPacket({ phone }).then(() => {
        setTelemetry(prev => [`[SIP] INVITE dispatched to ${phone}`, ...prev].slice(0, 30));
      }).catch((err: any) => {
        setTelemetry(prev => [`[ERR] ${err.message}`, ...prev].slice(0, 30));
      });
    } else {
      setTelemetry(prev => [`[DEV] Browser mode — simulating call to ${phone}`, ...prev].slice(0, 30));
      toast.info('Browser mode: SIP not active. Run in Electron for real calls.');
    }
  };

  const startRinging = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.setValueAtTime(480, ctx.currentTime);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      
      const playRing = () => {
        if (ctx.state === 'suspended') ctx.resume();
        gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.1);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);
      };

      playRing();
      const interval = setInterval(playRing, 6000);

      osc1.start();
      osc2.start();

      ringtoneRef.current = osc1;
      (ringtoneRef as any).current._interval = interval;
      (ringtoneRef as any).current._ctx = ctx;
    } catch (e) {}
  };

  const stopRinging = () => {
    if (ringtoneRef.current) {
      try {
        const anyRef = ringtoneRef.current as any;
        clearInterval(anyRef._interval);
        anyRef._ctx.close();
      } catch (e) {}
      ringtoneRef.current = null;
    }
  };

  const handleStatusSubmit = async (outcome: string) => {
    if (!currentLead) return;
    setIsLoading(true);
    try {
      const isBooked = outcome.toLowerCase() === 'booked';
      const newStats = {
        calls: dailyStats.calls + 1,
        booked: dailyStats.booked + (isBooked ? 1 : 0),
        talkTime: dailyStats.talkTime + callTimer
      };
      setDailyStats(newStats);

      await supabase.from('leads').update({
        status: outcome.toLowerCase(),
        notes: notesValue, 
        last_called_at: new Date().toISOString()
      }).eq('id', currentLead.id);

      await supabase.from('call_logs').insert({
        lead_id: currentLead.id,
        agent_email: agentEmail,
        outcome: outcome.toLowerCase(),
        duration_seconds: callTimer,
      });

      await supabase.from('daily_reports').upsert({
        user_id: userId,
        calls_made: newStats.calls,
        meetings_booked: newStats.booked,
        date: new Date().toISOString().split('T')[0],
      }, { onConflict: 'user_id,date' });

      // Save to local history
      saveCall({ callerId: currentLead.phone, direction: 'outbound', disposition: outcome.toLowerCase() });

      // Clear DNC/Redial state & IndexedDB note drafts
      clearTimeout(redialTimerRef.current);
      setRedialCount(0);
      await deleteNotesDraft(currentLead.id);
      setNotesValue('');
      notesRef.current = '';

      const remaining = agentLeads.filter(l => l.id !== currentLead.id);
      setAgentLeads(remaining);
      setCurrentLead(remaining[0] || null);
      setCallTimer(0);
      setStatus('idle');
      await updateAgentStatus('available');
      toast.success(`${outcome} — ${remaining.length} leads remaining`);
    } catch(err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDncClick = async () => {
    if (!currentLead) return;
    setIsLoading(true);
    try {
      const normalizedPhone = currentLead.phone.replace(/\s+/g, '');
      await supabase.from('dnc_list').insert({
        phone_number: normalizedPhone,
        added_by: agentEmail
      });
      dncSetRef.current.add(normalizedPhone);
      await handleStatusSubmit('DNC');
      toast.success('Added to Do Not Call (DNC) list');
    } catch (err: any) {
      toast.error(`DNC Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const endMission = async () => {
    if (!confirm(`Done for today? You made ${dailyStats.calls} calls and booked ${dailyStats.booked} appointments.`)) return;
    setIsLoading(true);
    await supabase.from('daily_reports').upsert({
      user_id: userId,
      calls_made: dailyStats.calls,
      meetings_booked: dailyStats.booked,
      date: new Date().toISOString().split('T')[0],
    }, { onConflict: 'user_id,date' });
    setIsAutoDialing(false);
    toast.success('Mission complete! Great work today.');
    setTimeout(async () => {
      await updateAgentStatus('offline');
      setIsLoggedIn(false);
      await supabase.auth.signOut();
    }, 1500);
    setIsLoading(false);
  };

  // Voicemail Setup Helpers
  const startVmRecording = async () => {
    try {
      setRecordedPcm(null);
      setRecordedAudioUrl(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          deviceId: selectedMic !== 'default' ? { exact: selectedMic } : undefined
        }
      });
      
      const context = new AudioContext();
      if (context.state === 'suspended') context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const pcmData: number[] = [];
      
      source.connect(processor);
      processor.connect(context.destination);
      
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) {
          pcmData.push(input[i]);
        }
      };
      
      vmRecorderRef.current = { context, stream, processor, pcmData };
      setIsRecordingVm(true);
      toast.info('Recording voicemail...');
    } catch (err: any) {
      toast.error(`Recording failed: ${err.message}`);
    }
  };

  const stopVmRecording = () => {
    if (!vmRecorderRef.current) return;
    const { context, stream, processor, pcmData } = vmRecorderRef.current;
    
    processor.disconnect();
    stream.getTracks().forEach(t => t.stop());
    context.close();
    
    const pcm = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    setRecordedPcm(pcm);
    setIsRecordingVm(false);
    vmRecorderRef.current = null;
    toast.success('Voicemail recorded successfully!');
    
    const dataLength = pcm.length * 2;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, 0x45564157, true); // "WAVE"
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 8000, true); // 8000Hz
    view.setUint32(28, 16000, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // 16-bit
    view.setUint32(36, 0x61746164, true); // "data"
    view.setUint32(40, dataLength, true);
    
    const blob = new Blob([header, pcm.buffer], { type: 'audio/wav' });
    setRecordedAudioUrl(URL.createObjectURL(blob));
  };

  const saveVmRecording = () => {
    if (!recordedPcm) return;
    if (window.electronAPI) {
      window.electronAPI.saveVoicemail(recordedPcm.buffer);
      toast.success('Voicemail drop configuration updated!');
      setShowVmModal(false);
    } else {
      toast.error('Electron not detected — Voicemail not saved');
    }
  };

  if (!isLoggedIn) return (
    <div className="h-screen bg-[#050505] flex items-center justify-center p-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.05),transparent_70%)]" />
      <div className="absolute top-0 right-0 p-6 flex gap-3 z-50">
        <button onClick={() => window.electronAPI.minimize()} className="p-2 text-silver hover:text-white transition-all"><Minus className="w-5 h-5" /></button>
        <button onClick={() => window.electronAPI.close()} className="p-2 text-silver hover:text-red-500 transition-all"><CloseIcon className="w-5 h-5" /></button>
      </div>
      <form onSubmit={async (e: any) => {
        e.preventDefault();
        setIsLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email: e.target.email.value, password: e.target.password.value });
        if (!error) checkSession(); else toast.error("Unauthorized Access");
        setIsLoading(false);
      }} className="w-full max-w-sm p-16 bg-white/[0.02] border border-white/5 rounded-[40px] space-y-12 relative z-10 backdrop-blur-xl">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><ShieldCheck className="w-8 h-8 text-accent" /></div>
          <h1 className="text-3xl font-bold tracking-tighter text-white uppercase italic">MAOS <span className="text-accent not-italic">ELITE</span></h1>
          <p className="text-[10px] font-black text-silver/40 uppercase tracking-[0.5em]">Identity Verification</p>
        </div>
        <div className="space-y-4">
          <input name="email" type="email" placeholder="Operator Email" className="w-full h-16 bg-white/[0.03] border border-white/5 rounded-2xl px-6 text-white text-sm focus:border-accent/40 outline-none transition-all" required />
          <input name="password" type="password" placeholder="Access Code" className="w-full h-16 bg-white/[0.03] border border-white/5 rounded-2xl px-6 text-white text-sm focus:border-accent/40 outline-none transition-all" required />
          <button type="submit" disabled={isLoading} className="w-full h-16 bg-accent text-white font-black text-[10px] uppercase tracking-[0.4em] rounded-2xl shadow-2xl shadow-accent/20 hover:opacity-90 transition-all">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Authorize"}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#050505] font-sans text-foreground overflow-hidden selection:bg-accent selection:text-white">
      <Toaster position="top-center" richColors theme="dark" />
      
      <header className="h-14 border-b border-white/[0.03] flex items-center justify-between px-6 bg-black/40 backdrop-blur-3xl relative z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent fill-current" />
            <span className="font-bold text-[11px] tracking-[0.2em] text-white uppercase italic">MAOS ELITE</span>
          </div>
          <div className="h-6 w-px bg-white/5" />
          <button
            onClick={() => {
              setIsAutoDialing(prev => {
                if (prev) clearInterval(countdownRef.current);
                return !prev;
              });
            }}
            className="flex items-center gap-3 px-4 py-1.5 bg-white/[0.02] rounded-full border border-white/5 hover:border-white/10 transition-all group"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isAutoDialing ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[9px] font-black text-silver uppercase tracking-widest">
              {isAutoDialing ? 'Auto-Dial: ON' : 'Manual Mode'}
            </span>
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-silver/40">
            <SignalHigh className={`w-3 h-3 ${voipStatus === 'secure' ? 'text-emerald-500' : 'text-red-500'}`} />
            <span className="text-[8px] font-black uppercase tracking-widest">
              {voipStatus === 'secure' ? 'Signal Secure' : 'Searching...'} | {assignedLine?.line_name || 'NO LINE'}
            </span>
            
            {!micAuthorized ? (
              <button 
                onClick={requestMicAccess}
                className="px-3 py-1 bg-red-500/20 text-red-500 border border-red-500/40 rounded text-[8px] font-black uppercase tracking-widest hover:bg-red-500/40 transition-all animate-pulse"
              >
                Authorize Mic
              </button>
            ) : (
              micLevel > 0 && (
                <div className="flex items-center gap-1 h-2">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-0.5 h-full rounded-full transition-all duration-75 ${micLevel > (i * 15) ? 'bg-accent' : 'bg-white/10'}`} 
                    />
                  ))}
                </div>
              )
            )}
            
            <button 
              onClick={() => loadAgentWorld(agentEmail)}
              className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-silver/40 hover:text-white transition-all flex items-center gap-2 group"
            >
              <RefreshCcw className={`w-3 h-3 ${isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              <span className="text-[8px] font-black uppercase tracking-widest">Sync Mission</span>
            </button>
            <div className="w-px h-4 bg-white/5" />
            <span className="text-[9px] font-black text-silver/40 uppercase tracking-widest">{agentName}</span>
          </div>
          <button onClick={endMission} className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-500/20 transition-all border border-emerald-500/20">
            Done For Today
          </button>
          <div className="flex gap-1 ml-2">
            <button onClick={() => setView(view === 'mission' ? 'manual' : 'mission')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${view === 'manual' ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white/5 text-silver/40 border-white/10 hover:bg-white/10'}`}>
              {view === 'manual' ? 'Back to Mission' : 'Direct Dial'}
            </button>
            <div className="w-px h-6 bg-white/5 mx-2" />
            <button onClick={() => window.electronAPI.minimize()} className="p-1.5 text-silver hover:text-white"><Minus className="w-4 h-4" /></button>
            <button onClick={() => window.electronAPI.close()} className="p-1.5 text-silver hover:text-red-500"><CloseIcon className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {view === 'manual' ? (
          <section className="flex-1 flex bg-[#050505]">
            <div className="w-[450px] border-r border-white/[0.03] p-12 flex flex-col justify-center space-y-12 bg-black/20">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <p className="text-[8px] font-black text-silver/20 uppercase tracking-[0.4em] pl-2">Region</p>
                  <select 
                    value={countryCode} 
                    onChange={e => setCountryCode(e.target.value)}
                    className="w-full h-14 bg-white/[0.03] border border-white/5 rounded-2xl px-4 text-xs text-white focus:border-accent/40 outline-none transition-all"
                  >
                    <option value="+1">🇺🇸 +1 (US/CA)</option>
                    <option value="+44">🇬🇧 +44 (UK)</option>
                    <option value="+61">🇦🇺 +61 (AU)</option>
                    <option value="+91">🇮🇳 +91 (IN)</option>
                    <option value="+971">🇦🇪 +971 (UAE)</option>
                  </select>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-[8px] font-black text-silver/20 uppercase tracking-[0.4em] pl-2">Target</p>
                  <input 
                    value={manualNumber} 
                    onChange={e => setManualNumber(e.target.value)}
                    placeholder="000-000-0000" 
                    className="w-full h-14 bg-transparent text-2xl font-mono font-black text-white outline-none placeholder:text-white/5" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[1,2,3,4,5,6,7,8,9,'+',0,'#'].map(n => (
                  <button 
                    key={n} 
                    onClick={() => setManualNumber(prev => prev + (n === '+' ? '' : n))}
                    onMouseDown={() => { if(n === '+') setManualNumber(prev => '+' + prev) }}
                    className="h-16 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center text-xl font-bold text-white hover:bg-white/[0.05] hover:border-white/10 transition-all active:scale-95"
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                {status === 'incoming' ? (
                  <>
                    <button onClick={() => {
                      if (isAnsweringRef.current) return;
                      isAnsweringRef.current = true;
                      window.electronAPI.answerIncoming();
                      stopRinging();
                      setTelemetry(prev => ['[⏳] Waiting for ACK...', ...prev].slice(0, 30));
                    }} className="flex-1 h-20 bg-emerald-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all">
                      <Phone className="w-5 h-5 fill-current" /> Answer
                    </button>
                    <button onClick={() => {
                      window.electronAPI.declineIncoming();
                      setStatus('post-call');
                      stopRinging();
                    }} className="flex-1 h-20 bg-red-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all">
                      <PhoneOff className="w-5 h-5 fill-current" /> Decline
                    </button>
                  </>
                ) : status === 'idle' || status === 'post-call' ? (
                  <button 
                    onClick={() => handleInitiateCall(manualNumber)}
                    disabled={!manualNumber || (status !== 'idle' && status !== 'post-call')}
                    className="flex-1 h-20 bg-emerald-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-20"
                  >
                    <Phone className="w-5 h-5 fill-current" /> Initiate
                  </button>
                ) : (
                   <button 
                    onClick={handleHangup}
                    className="flex-1 h-20 bg-red-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all animate-pulse"
                  >
                    <PhoneOff className="w-5 h-5 fill-current" /> End Call
                  </button>
                )}
                <button 
                  onClick={() => setManualNumber('')}
                  disabled={status !== 'idle'}
                  className="w-20 h-20 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-silver/40 hover:text-white transition-all disabled:opacity-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-12 flex flex-col space-y-8 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.03),transparent_70%)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SignalHigh className="w-5 h-5 text-accent" />
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest italic">Live Signal Telemetry</h3>
                </div>
                <button onClick={() => setTelemetry(['Console Reset...'])} className="text-[9px] font-black text-silver/20 uppercase tracking-widest hover:text-silver/40">Clear Feed</button>
              </div>

              <div className="flex-1 bg-black border border-white/5 rounded-[40px] p-10 font-mono text-xs overflow-y-auto custom-scrollbar shadow-2xl select-text selection:bg-accent/30">
                <div className="space-y-4">
                  {telemetry.map((log, i) => (
                    <div key={i} className={`flex gap-4 ${i === 0 ? 'text-emerald-500' : 'text-silver/40'}`}>
                      <span className="opacity-20 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                      <span className="tracking-tight break-all">{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* LEFT: Lead Dossier */}
            <aside className="w-[340px] border-r border-white/[0.03] p-8 flex flex-col space-y-10 bg-black/20 overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-accent/60 opacity-60">
                    <Building2 className="w-4 h-4" />
                    <h3 className="text-[9px] font-black uppercase tracking-widest italic">Target Dossier</h3>
                  </div>
                  {currentCampaign && (currentCampaign.country || currentCampaign.state) && (
                    <span className="px-3 py-1 bg-white/[0.05] rounded-lg text-[8px] font-black text-silver/40 uppercase tracking-widest border border-white/5">
                      {currentCampaign.country} {currentCampaign.state ? `| ${currentCampaign.state}` : ''}
                    </span>
                  )}
                </div>
                
                {currentLead ? (
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <p className="text-[8px] font-black text-silver/20 uppercase tracking-widest">Lead Entity</p>
                      <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">{currentLead.first_name}</h2>
                    </div>

                    <div className="space-y-6 pt-4 border-t border-white/5">
                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-silver/20 uppercase tracking-widest">Phone Frequency</p>
                        <div className="flex items-center gap-3">
                          <Phone className="w-4 h-4 text-accent/40" />
                          <p className="text-xl font-mono text-white/90">{currentLead.phone}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-silver/20 uppercase tracking-widest">Email Signal</p>
                        <div className="flex items-center gap-3">
                          <Mail className="w-4 h-4 text-white/10" />
                          <p className="text-xs text-white/60 truncate">{currentLead.email || 'Not Detected'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center opacity-10 font-black text-[9px] uppercase tracking-widest italic">Waiting for Mission Release</div>
                )}
              </div>

              <div className="mt-auto pt-10 border-t border-white/5">
                <button onClick={() => setShowLeadsList(true)} className="w-full py-3 bg-white/[0.02] border border-white/5 rounded-xl text-silver/40 text-[9px] font-black uppercase tracking-widest hover:bg-white/[0.05] flex items-center justify-center gap-2">
                  <LayoutGrid className="w-3 h-3" /> Lead Manifest ({allLeads.length})
                </button>
              </div>
            </aside>

            {/* CENTER: Call Console */}
            <section className="flex-1 flex flex-col p-8 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01),transparent_80%)]">
              <div className="flex-1 flex flex-col items-center justify-center space-y-10">
                {currentLead && (
                  <div className="w-full max-w-xl space-y-10">
                    <div className="flex flex-col items-center space-y-4">
                      {status === 'active' ? (
                        <div className="flex flex-col items-center space-y-4">
                          {/* Dual Audio Meter */}
                          <div className="flex items-end gap-8">
                            {/* MIC — Left meter (agent voice) */}
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex items-end gap-[3px] h-10">
                                {[...Array(8)].map((_, i) => {
                                  const threshold = (i / 8) * 100;
                                  const active = micLevel > threshold;
                                  return (
                                    <div
                                      key={i}
                                      className="w-[3px] rounded-full transition-all duration-75"
                                      style={{
                                        height: `${8 + i * 4}px`,
                                        background: active
                                          ? `rgba(249,115,22,${0.4 + (i / 8) * 0.6})`
                                          : 'rgba(255,255,255,0.06)',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Mic className="w-3 h-3 text-accent/60" />
                                <span className="text-[8px] font-black text-silver/30 uppercase tracking-widest">You</span>
                              </div>
                            </div>

                            {/* CALL TIMER — Center */}
                            <p className="text-5xl font-mono font-black text-emerald-500 tracking-tighter">
                              {Math.floor(callTimer/60).toString().padStart(2,'0')}:{(callTimer%60).toString().padStart(2,'0')}
                            </p>

                            {/* SPEAKER — Right meter (remote caller voice) */}
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex items-end gap-[3px] h-10">
                                {[...Array(8)].map((_, i) => {
                                  const threshold = (i / 8) * 100;
                                  const active = speakerLevel > threshold;
                                  return (
                                    <div
                                      key={i}
                                      className="w-[3px] rounded-full transition-all duration-75"
                                      style={{
                                        height: `${8 + i * 4}px`,
                                        background: active
                                          ? `rgba(52,211,153,${0.4 + (i / 8) * 0.6})`
                                          : 'rgba(255,255,255,0.06)',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <SignalHigh className="w-3 h-3 text-emerald-500/60" />
                                <span className="text-[8px] font-black text-silver/30 uppercase tracking-widest">Them</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center">
                          <Phone className={`w-8 h-8 ${status === 'calling' ? 'text-accent animate-pulse' : 'text-white/10'}`} />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4">
                      {status === 'incoming' ? (
                        <>
                          <button onClick={() => {
                            if (isAnsweringRef.current) return;
                            isAnsweringRef.current = true;
                            window.electronAPI.answerIncoming();
                            stopRinging();
                            setTelemetry(prev => ['[⏳] Waiting for ACK...', ...prev].slice(0, 30));
                          }} className="flex-1 h-20 bg-emerald-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all">
                            <Phone className="w-5 h-5 fill-current" /> Answer
                          </button>
                          <button onClick={() => {
                            window.electronAPI.declineIncoming();
                            setStatus('post-call');
                            stopRinging();
                          }} className="flex-1 h-20 bg-red-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all">
                            <PhoneOff className="w-5 h-5 fill-current" /> Decline
                          </button>
                        </>
                      ) : status === 'idle' || status === 'post-call' ? (
                        <button onClick={() => handleInitiateCall()} className="flex-1 h-20 bg-emerald-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all">
                          <Phone className="w-5 h-5 fill-current" /> {status === 'post-call' ? 'Call Again' : 'Start Call'}
                        </button>
                      ) : (
                        <button 
                          disabled={isVmDropping}
                          onClick={handleHangup} 
                          className="flex-1 h-20 bg-red-500 text-white rounded-2xl flex items-center justify-center gap-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all animate-pulse disabled:opacity-20"
                        >
                          <PhoneOff className="w-5 h-5 fill-current" /> End Call
                        </button>
                      )}
                      <button onClick={() => {
                        const next = agentLeads.filter(l => l.id !== currentLead.id)[0];
                        setCurrentLead(next || null);
                        setCallTimer(0);
                        setStatus('idle');
                        stopRinging();
                        toast.info("Next Lead Loaded");
                      }} className="w-20 h-20 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center text-silver/40 hover:text-white transition-all">
                        <ChevronRight className="w-8 h-8" />
                      </button>
                    </div>
                    
                    {/* Softphone Controls */}
                    <div className="flex justify-center gap-4 pt-4">
                      <button 
                        disabled={isVmDropping}
                        onClick={() => {
                          setIsMuted(prev => {
                            isMutedRef.current = !prev;
                            return !prev;
                          });
                        }}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isMuted ? 'bg-red-500/20 text-red-500 border-red-500/40' : 'bg-white/5 text-silver/40 border-white/10 hover:bg-white/10'} disabled:opacity-20`}
                      >
                        {isMuted ? 'Mic Muted' : 'Mute Mic'}
                      </button>
                      <button 
                        disabled={isVmDropping}
                        onClick={() => setIsOnHold(!isOnHold)}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isOnHold ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40' : 'bg-white/5 text-silver/40 border-white/10 hover:bg-white/10'} disabled:opacity-20`}
                      >
                        {isOnHold ? 'On Hold' : 'Hold Call'}
                      </button>
                      <button 
                        disabled={isVmDropping}
                        onClick={async () => {
                          if (window.electronAPI) {
                            setIsVmDropping(true);
                            window.electronAPI.dropVoicemail();
                            toast.warning('Voicemail dropping...');
                            setTelemetry(prev => ['[VM] Voicemail drop initiated...', ...prev].slice(0, 30));
                          } else {
                            toast.error('Electron not detected — VM Drop unavailable');
                          }
                        }}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isVmDropping ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 animate-pulse' : 'bg-white/5 text-silver/40 border-white/10 hover:bg-white/10'}`}
                      >
                        {isVmDropping ? 'Dropping VM...' : 'Drop Voicemail'}
                      </button>
                    </div>

                    {/* DTMF Active Overlay */}
                    {status === 'active' && (
                      <div className="flex flex-col items-center space-y-2 pt-2">
                        <p className="text-[8px] font-black text-silver/20 uppercase tracking-widest">DTMF Keypad</p>
                        <div className="grid grid-cols-3 gap-2 w-48">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((d) => (
                            <button
                              key={d}
                              onClick={() => {
                                if (window.electronAPI) window.electronAPI.sendDtmf(d.toString());
                              }}
                              className="h-10 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 active:scale-95 transition-all"
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-center items-center gap-3">
                      <select 
                        value={selectedMic} 
                        onChange={e => setSelectedMic(e.target.value)}
                        className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2 text-[9px] font-black uppercase tracking-widest text-silver/60 focus:border-accent/40 outline-none transition-all max-w-[200px] truncate"
                      >
                        <option value="default">Default Microphone</option>
                        {audioDevices.map(d => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.substring(0, 5)}`}</option>
                        ))}
                      </select>
                      
                      <button 
                        onClick={() => setShowVmModal(true)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[9px] font-black uppercase tracking-widest text-silver/60 hover:text-white transition-all flex items-center gap-1.5"
                      >
                        <Mic className="w-3 h-3 text-accent" /> Voicemail Setup
                      </button>
                    </div>

                    <div className="space-y-4">
                      <textarea 
                        value={notesValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNotesValue(val);
                          notesRef.current = val;
                          
                          clearTimeout(notesSaveTimerRef.current);
                          notesSaveTimerRef.current = setTimeout(async () => {
                            if (notesRef.current && notesLeadIdRef.current) {
                              await saveNotesDraft(notesLeadIdRef.current, notesRef.current);
                              setShowDraftSaved(true);
                              setTimeout(() => setShowDraftSaved(false), 2000);
                            }
                          }, 5000);
                        }}
                        placeholder="Call Intelligence..." 
                        className="w-full h-32 bg-white/[0.02] border border-white/5 rounded-2xl p-6 text-sm text-white focus:border-accent/20 outline-none resize-none placeholder:text-white/5" 
                      />
                      <div className="flex justify-between items-center text-[10px] px-2">
                        <span className="text-silver/40">Auto-saves draft every 5s</span>
                        <AnimatePresence>
                          {showDraftSaved && (
                            <motion.span 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="text-emerald-500 font-bold"
                            >
                              Draft Saved
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {['Booked', 'Interested', 'Voicemail', 'No Answer', 'Busy', 'Call Back', 'Not Interested'].map((s) => (
                          <button key={s} onClick={() => handleStatusSubmit(s)} className="py-3 bg-white/[0.03] border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-silver/60 hover:text-white hover:bg-white/5 transition-all">
                            {s}
                          </button>
                        ))}
                        <button onClick={handleDncClick} className="py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/20 transition-all">
                          DNC
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* RIGHT: Stats */}
            <aside className="w-[280px] border-l border-white/[0.03] p-8 flex flex-col space-y-10 bg-black/20 overflow-hidden">
              <div className="space-y-6">
                <h3 className="text-[9px] font-black text-silver/30 uppercase tracking-widest italic">Performance</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black text-silver/30 uppercase tracking-widest mb-1">Signals</p>
                    <p className="text-3xl font-bold text-white tracking-tighter">{dailyStats.calls}</p>
                  </div>
                  <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                    <p className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest mb-1">Bookings</p>
                    <p className="text-3xl font-bold text-emerald-500 tracking-tighter">{dailyStats.booked}</p>
                  </div>
                </div>
              </div>

              {/* Mission Telemetry Log */}
              <div className="flex-1 flex flex-col space-y-4 pt-6 border-t border-white/5 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="text-[8px] font-black text-silver/30 uppercase tracking-widest italic">Live Feed</h3>
                  <button onClick={() => setTelemetry(['Console Reset...'])} className="text-[7px] font-black text-silver/10 uppercase tracking-widest hover:text-silver/30 transition-all">Clear</button>
                </div>
                <div className="flex-1 bg-white/[0.01] border border-white/5 rounded-2xl p-4 font-mono text-[9px] overflow-y-auto custom-scrollbar select-text selection:bg-accent/30">
                  <div className="space-y-2">
                    {telemetry.map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-white/5 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                        <span className={`break-all ${log.includes('[ERR]') ? 'text-red-400' : log.includes('[SIP]') ? 'text-accent' : 'text-silver/40'}`}>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          </>
        )}
      </main>

      {/* Voicemail Setup Modal */}
      <AnimatePresence>
        {showVmModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 space-y-8 relative shadow-2xl">
              <button 
                onClick={() => {
                  if (isRecordingVm) stopVmRecording();
                  setShowVmModal(false);
                }} 
                className="absolute top-6 right-6 text-silver hover:text-white transition-all"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="text-center space-y-2">
                <Mic className="w-12 h-12 text-accent mx-auto" />
                <h3 className="text-xl font-bold text-white tracking-tight uppercase italic">Voicemail Drop Setup</h3>
                <p className="text-[9px] font-black text-silver/40 uppercase tracking-[0.2em]">Record your voicemail greeting</p>
              </div>

              <div className="flex flex-col items-center space-y-6">
                {isRecordingVm ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/40 flex items-center justify-center animate-pulse">
                      <div className="w-4 h-4 rounded-full bg-red-500" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-red-500">Recording Live...</span>
                  </div>
                ) : (
                  <button 
                    onClick={startVmRecording}
                    className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
                  >
                    <div className="w-4 h-4 rounded-full bg-accent" />
                  </button>
                )}

                <div className="flex gap-4 w-full">
                  {isRecordingVm ? (
                    <button 
                      onClick={stopVmRecording}
                      className="w-full py-3 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                    >
                      Stop Recording
                    </button>
                  ) : (
                    recordedAudioUrl && (
                      <div className="w-full flex flex-col items-center space-y-4">
                        <audio src={recordedAudioUrl} controls className="w-full h-10 rounded-lg" />
                        <button 
                          onClick={saveVmRecording}
                          className="w-full py-3 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                        >
                          Save Voicemail
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLeadsList && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed inset-0 z-[100] bg-[#050505]/95 backdrop-blur-2xl flex flex-col p-12"
          >
            <div className="flex justify-between items-center mb-12">
              <div>
                <h2 className="text-4xl font-bold tracking-tighter uppercase italic text-white">Mission Manifest</h2>
                <p className="text-[10px] font-black text-silver/40 uppercase tracking-[0.4em] mt-2">Active Target Selection</p>
              </div>
              <button onClick={() => setShowLeadsList(false)} className="p-4 bg-white/5 rounded-2xl text-white hover:bg-white/10 transition-all">
                <CloseIcon className="w-8 h-8" />
              </button>
            </div>

            <div className="relative mb-8">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-silver/20" />
              <input 
                value={leadsListSearch}
                onChange={e => setLeadsListSearch(e.target.value)}
                placeholder="Search dossiers..." 
                className="w-full h-16 bg-white/[0.03] border border-white/5 rounded-2xl pl-16 pr-6 text-white text-sm focus:border-accent/40 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar pr-4">
              {allLeads
                .filter(l => 
                  l.first_name?.toLowerCase().includes(leadsListSearch.toLowerCase()) || 
                  l.phone?.includes(leadsListSearch)
                )
                .map(lead => (
                <div 
                  key={lead.id} 
                  className="p-8 bg-white/[0.02] border border-white/5 rounded-[32px] flex items-center justify-between hover:bg-white/[0.04] hover:border-white/10 transition-all group relative overflow-hidden"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-center text-silver/20 group-hover:text-accent group-hover:bg-accent/10 transition-all">
                      <Building2 className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg tracking-tight truncate max-w-[150px]">{lead.first_name}</p>
                      <p className="text-[10px] font-mono text-silver/30 uppercase tracking-widest mt-1">{lead.phone}</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setCurrentLead(lead);
                      setShowLeadsList(false);
                      setStatus('idle');
                      stopRinging();
                    }}
                    className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-silver/40 hover:text-white hover:bg-accent hover:border-accent transition-all shadow-xl"
                  >
                    <Eye className="w-6 h-6" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}
