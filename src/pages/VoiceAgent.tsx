import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import KnowledgeSidebar from '../components/KnowledgeSidebar'

const API_URL = import.meta.env.VITE_API_URL || ''
const socket = io(API_URL || window.location.origin)


// ──── Types ────
type TranscriptEntry = {
    id: string
    speaker: 'agent' | 'customer'
    text: string
    time: string
}

type AiCoaching = {
    nextAction: string
    smartReplies: string[]
    sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated'
    insights: { label: string; tip: string; color: 'green' | 'blue' | 'amber' | 'rose' }[]
    escalationRisk: number
}

type KnowledgeSnippet = {
    text: string
    docName: string
    score: number
}

// ──── Web Speech API type declarations ────
declare global {
    interface Window {
        SpeechRecognition: any
        webkitSpeechRecognition: any
    }
}

const insightColors = {
    green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    rose: 'bg-rose-50 border-rose-100 text-rose-700',
}

const sentimentConfig = {
    positive: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', emoji: '😊', label: 'Positive' },
    neutral: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', emoji: '😐', label: 'Neutral' },
    negative: { bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-600', emoji: '😤', label: 'Negative' },
    frustrated: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-600', emoji: '😠', label: 'Frustrated' },
}

const VoiceAgent: React.FC = () => {
    // ── Call state ──
    const [callActive, setCallActive] = useState(false)
    const [callTimer, setCallTimer] = useState(0)
    const [callerName, setCallerName] = useState('Incoming Caller')
    const [isMuted, setIsMuted] = useState(false)
    const [sttSupported, setSttSupported] = useState(true)

    // ── Transcript ──
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
    const [interimText, setInterimText] = useState('')

    // ── AI Coaching (Gemini-powered, fully prompt-driven) ──
    const [aiCoaching, setAiCoaching] = useState<AiCoaching | null>(null)
    const [knowledgeSnippets, setKnowledgeSnippets] = useState<KnowledgeSnippet[]>([])
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState(false)

    // ── Summary ──
    const [summaryText, setSummaryText] = useState<string | null>(null)
    const [showSummary, setShowSummary] = useState(false)
    const [summaryLoading, setSummaryLoading] = useState(false)

    // ── TTS ──
    const [ttsPlaying, setTtsPlaying] = useState<string | null>(null)

    // Share link state
    const [linkCopied, setLinkCopied] = useState(false)

    // ── Session ──
    const [sessionId] = useState(`voice-${Date.now()}`)
    const [showMobileCoaching, setShowMobileCoaching] = useState(false)

    const recognitionRef = useRef<any>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const transcriptEndRef = useRef<HTMLDivElement>(null)
    const coachingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // WebRTC references
    const localStreamRef = useRef<MediaStream | null>(null)
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null)

    // ──── Customer → Agent: receive entries the customer speaks ────
    useEffect(() => {
        const handleNewEntry = ({ entry }: { entry: { id: string; speaker: string; text: string; time: string } }) => {
            // Only add if it's from the customer (agent's own entries are already added locally)
            if (entry.speaker === 'customer') {
                setTranscript(prev => [...prev, entry as any])
                // Note: We no longer play TTS here. The real audio is coming through WebRTC!
            }
        }

        socket.on('voice_new_entry', handleNewEntry)

        // WebRTC Signaling handlers
        socket.on('voice_webrtc_offer', async ({ offer }) => {
            console.log("[WebRTC Agent] Received Offer")
            if (!peerConnectionRef.current) return
            try {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer))
                const answer = await peerConnectionRef.current.createAnswer()
                await peerConnectionRef.current.setLocalDescription(answer)
                console.log("[WebRTC Agent] Sending Answer")
                socket.emit('voice_webrtc_answer', { sessionId, answer })
            } catch (err) {
                console.error("Error handling WebRTC offer:", err)
            }
        })

        socket.on('voice_webrtc_answer', async ({ answer }) => {
            console.log("[WebRTC Agent] Received Answer")
            if (!peerConnectionRef.current) return
            try {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
            } catch (err) {
                console.error("Error setting WebRTC answer:", err)
            }
        })

        socket.on('voice_webrtc_ice_candidate', async ({ candidate }) => {
            console.log("[WebRTC Agent] Received ICE Candidate")
            if (peerConnectionRef.current && candidate) {
                try {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
                } catch (e) {
                    console.error("Error adding ice candidate:", e)
                }
            }
        })

        return () => {
            socket.off('voice_new_entry', handleNewEntry)
            socket.off('voice_webrtc_offer')
            socket.off('voice_webrtc_answer')
            socket.off('voice_webrtc_ice_candidate')
        }
    }, [sessionId])

    // ──── Rejoin room if socket reconnects ────
    useEffect(() => {
        const reJoin = () => {
            if (callActive) {
                // Use voice_join to safely rejoin the room without wiping server history
                socket.emit('voice_join', { sessionId })
            }
        }
        socket.on('connect', reJoin)
        return () => { socket.off('connect', reJoin) }
    }, [callActive, sessionId])

    // ──── Auto-scroll ────
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [transcript, interimText])

    // ──── Check STT support ────
    useEffect(() => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRec) setSttSupported(false)
    }, [])

    // ──── AI Coaching — debounced call to /api/coaching on every new transcript entry ────
    useEffect(() => {
        // Don't call if empty
        const finalEntries = transcript.filter(e => e.text.trim())
        if (finalEntries.length === 0) {
            setAiCoaching(null)
            return
        }

        // Debounce: wait 1.5s after the last new entry
        if (coachingDebounceRef.current) clearTimeout(coachingDebounceRef.current)
        setAiLoading(true)
        setAiError(false)

        coachingDebounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/api/coaching`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transcript: finalEntries.map(e => ({ role: e.speaker, text: e.text }))
                    })
                })
                const data = await res.json()
                if (data.coaching) {
                    setAiCoaching(data.coaching)
                    setKnowledgeSnippets(data.knowledgeContext || [])
                    setAiError(false)
                } else {
                    setAiError(true)
                }
            } catch {
                setAiError(true)
            }
            setAiLoading(false)
        }, 1500)
    }, [transcript])

    // Initialize WebRTC Peer Connection
    const initWebRTC = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            localStreamRef.current = stream

            const configuration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ]
            }
            const pc = new RTCPeerConnection(configuration)
            peerConnectionRef.current = pc

            // Add local tracks
            stream.getTracks().forEach(track => pc.addTrack(track, stream))

            // State changes
            pc.oniceconnectionstatechange = () => console.log("[WebRTC Agent] ICE State:", pc.iceConnectionState)
            pc.onconnectionstatechange = () => console.log("[WebRTC Agent] Connection State:", pc.connectionState)

            // Handle ICE candidates
            pc.onicecandidate = event => {
                if (event.candidate) {
                    console.log("[WebRTC Agent] Gathered local ICE candidate")
                    socket.emit('voice_webrtc_ice_candidate', { sessionId, candidate: event.candidate })
                }
            }

            // Handle incoming remote audio stream
            pc.ontrack = event => {
                console.log("[WebRTC Agent] Received remote track")
                if (remoteAudioRef.current && event.streams[0]) {
                    remoteAudioRef.current.srcObject = event.streams[0]
                    // Force play in case of browser autoplay policies
                    remoteAudioRef.current.play().catch(e => console.error("Customer playback error:", e))
                }
            }

            // DO NOT create an offer here. The Agent waits for the Customer to send an offer
            // since the Agent is the one receiving the dial-in connection.

        } catch (err) {
            console.error("Failed to get local audio:", err)
            alert("Microphone access is required for real voice transfer.")
        }
    }

    // ──── Start Call ────
    const startCall = useCallback(async () => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRec) return

        await initWebRTC()

        setCallActive(true)
        setTranscript([])
        setInterimText('')
        setCallTimer(0)
        setAiCoaching(null)

        socket.emit('voice_start', { sessionId, callerName })
        console.log("[WebRTC Agent] Emitting voice_request_offer")
        socket.emit('voice_request_offer', { sessionId })

        // Start timer
        timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)

        // Start Google Speech Recognition
        const recognition = new SpeechRec()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event: any) => {
            let interim = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i]
                if (result.isFinal) {
                    const finalText = result[0].transcript.trim()
                    if (!finalText) return
                    const entry: TranscriptEntry = {
                        id: Date.now().toString(),
                        speaker: 'agent',
                        text: finalText,
                        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                    }
                    setTranscript(prev => [...prev, entry])
                    setInterimText('')
                    socket.emit('voice_transcript', { sessionId, entry })
                } else {
                    interim += result[0].transcript
                }
            }
            setInterimText(interim)
        }

        recognition.onerror = (e: any) => {
            if (e.error !== 'no-speech') console.error('STT error:', e.error)
        }

        recognition.onend = () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.start() } catch (_) { }
            }
        }

        recognition.start()
        recognitionRef.current = recognition
    }, [sessionId, callerName])

    // ──── End Call ────
    const endCall = useCallback(() => {
        setCallActive(false)
        if (timerRef.current) clearInterval(timerRef.current)
        if (recognitionRef.current) {
            recognitionRef.current.onend = null
            recognitionRef.current.stop()
            recognitionRef.current = null
        }

        // Cleanup WebRTC
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop())
            localStreamRef.current = null
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close()
            peerConnectionRef.current = null
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null
        }

        setInterimText('')
        socket.emit('voice_end', { sessionId })
    }, [sessionId])

    // ──── Mute toggle ────
    const toggleMute = () => {
        setIsMuted(m => {
            const nextMuted = !m
            if (nextMuted && recognitionRef.current) recognitionRef.current.stop()
            else if (!nextMuted && recognitionRef.current) {
                try { recognitionRef.current.start() } catch (_) { }
            }

            // Mute actual WebRTC audio track
            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(track => {
                    track.enabled = !nextMuted
                })
            }
            return nextMuted
        })
    }

    // ──── Quick Reply (Log text, but agent will actually read it aloud) ────
    const speakReply = async (text: string) => {
        // We log it to the transcript but don't play TTS anymore because the agent is using real voice.
        const entry: TranscriptEntry = {
            id: `reply-${Date.now()}`,
            speaker: 'agent',
            text,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }
        setTranscript(prev => [...prev, entry])
        socket.emit('voice_transcript', { sessionId, entry })
    }

    // ──── Generate Gemini Summary ────
    const generateSummary = async () => {
        if (!transcript.length) return
        setSummaryLoading(true)
        try {
            const transcriptText = transcript
                .map(e => `${e.speaker.toUpperCase()} [${e.time}]: ${e.text}`)
                .join('\n')
            const res = await fetch(`${API_URL}/api/voice/summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: transcriptText })
            })
            const data = await res.json()
            if (data.summary) { setSummaryText(data.summary); setShowSummary(true) }
        } catch { }
        setSummaryLoading(false)
    }

    const formatTimer = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

    // Smart replies: Gemini if available, else safe defaults
    const smartReplies = aiCoaching?.smartReplies?.length
        ? aiCoaching.smartReplies
        : ['Could you please share your name, phone number, and email for verification?',
            'Thank you for holding. Let me look into that for you right away.',
            'I completely understand. Let me see what options we have available.']

    const currentSentiment = aiCoaching?.sentiment ?? 'neutral'
    const sc = sentimentConfig[currentSentiment] ?? sentimentConfig.neutral

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Hidden audio element to play the remote customer's voice via WebRTC */}
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

            {/* ─── Top Nav ─── */}
            <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm z-30">
                <div className="flex items-center gap-2 md:gap-3">
                    <a href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        <span className="text-[10px] md:text-xs font-medium hidden sm:inline">Back</span>
                    </a>
                    <div className="h-4 w-px bg-slate-200 hidden sm:block" />
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-800 tracking-tight text-sm md:text-base">Voice Agent</span>
                    </div>
                    {callActive && (
                        <div className="flex items-center gap-1.5 bg-red-50 text-red-500 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold ring-1 ring-red-100 ml-1 md:ml-2">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="hidden xs:inline">LIVE · </span>{formatTimer(callTimer)}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3 md:gap-4 border-l border-slate-200 pl-4 md:pl-6">
                    <a href="/customer" target="_blank" className="text-[10px] md:text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">Customer</a>
                    <button
                        onClick={() => setShowMobileCoaching(!showMobileCoaching)}
                        className="xl:hidden p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        title="Toggle Coaching"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </button>
                    <a href="/admin" target="_blank" className="hidden sm:inline text-[10px] md:text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">Admin</a>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden relative">

                {/* ─── Transcript Panel ─── */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Call Banner */}
                    <div className={`px-4 md:px-8 py-3 md:py-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between shrink-0 transition-all duration-300 gap-3 ${callActive ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto">
                            <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-base md:text-lg font-bold shrink-0 ${callActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {callerName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                {callActive ? (
                                    <>
                                        <p className="font-bold text-xs md:text-sm truncate">{callerName}</p>
                                        <p className="text-[10px] md:text-xs opacity-75 flex items-center gap-1">
                                            <span className="w-1 h-1 md:w-1.5 md:h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                                            <span className="truncate">Connected</span>
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <input
                                            className="font-bold text-xs md:text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 border-b border-dashed border-slate-300 focus:border-indigo-400 pb-0.5 w-full max-w-xs"
                                            placeholder="Enter caller name..."
                                            value={callerName}
                                            onChange={e => setCallerName(e.target.value)}
                                        />
                                        <p className="text-[9px] md:text-[10px] text-slate-400 mt-0.5">Ready to start call</p>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto justify-end sm:justify-start">
                            {callActive ? (
                                <>
                                    {/* Copy Customer Link */}
                                    <button
                                        onClick={() => {
                                            const url = `${window.location.origin}/voice/customer?session=${sessionId}`
                                            navigator.clipboard.writeText(url)
                                            setLinkCopied(true)
                                            setTimeout(() => setLinkCopied(false), 2500)
                                        }}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[9px] md:text-[10px] font-bold transition-all whitespace-nowrap ${linkCopied
                                            ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-400/40'
                                            : 'bg-white/20 hover:bg-white/30 text-white'}`}
                                    >
                                        {linkCopied ? '✅ Copied!' : <><span className="hidden xs:inline">🔗 </span>Link</>}
                                    </button>
                                    <button
                                        onClick={toggleMute}
                                        title={isMuted ? 'Unmute' : 'Mute'}
                                        className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${isMuted ? 'bg-red-400/80 ring-2 ring-white/50' : 'bg-white/20 hover:bg-white/30'}`}
                                    >
                                        {isMuted
                                            ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                            : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                                        }
                                    </button>
                                    <button onClick={endCall} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold transition-all shadow-lg shadow-red-500/30 active:scale-95 whitespace-nowrap">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" /></svg>
                                        <span className="hidden xs:inline">End Call</span><span className="xs:hidden">End</span>
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={startCall}
                                    disabled={!sttSupported}
                                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-bold transition-all shadow-lg shadow-emerald-500/30 active:scale-95"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" /></svg>
                                    Start Call
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Chrome warning */}
                    {!sttSupported && (
                        <div className="mx-4 md:mx-8 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-[10px] md:text-xs font-medium uppercase tracking-tight">
                            ⚠️ Chrome required for Speech Recognition.
                        </div>
                    )}

                    {/* Transcript */}
                    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-3">
                        {transcript.length === 0 && !callActive && (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12 md:py-20">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-3xl md:text-4xl mb-4 md:mb-5 shadow-inner">🎙️</div>
                                <h3 className="text-base md:text-lg font-bold text-slate-700">Ready to take a call</h3>
                                <p className="text-slate-400 text-xs md:text-sm mt-2 max-w-sm px-4">Click <strong>Start Call</strong> to begin. Google STT transcribes; Gemini AI provides coaching tags & smart replies.</p>
                                <div className="mt-6 grid grid-cols-2 xs:grid-cols-3 gap-2 md:gap-3 max-w-sm w-full px-4">
                                    {['🎙️ Live STT', '🧠 Gemini Coaching', '🔊 Google TTS'].map(f => (
                                        <div key={f} className="bg-white border border-slate-200 rounded-xl p-2 md:p-3 text-center">
                                            <p className="text-[9px] md:text-[11px] font-bold text-slate-600">{f}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {transcript.map(entry => (
                            <div key={entry.id} className={`flex gap-2 md:gap-3 ${entry.speaker === 'agent' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold shadow-sm ${entry.speaker === 'agent' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                    {entry.speaker === 'agent' ? 'A' : 'C'}
                                </div>
                                <div className={`max-w-[85%] md:max-w-[68%] flex flex-col gap-1 ${entry.speaker === 'agent' ? 'items-end' : 'items-start'}`}>
                                    <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider ${entry.speaker === 'agent' ? 'text-indigo-500' : 'text-slate-400'}`}>
                                        {entry.speaker === 'agent' ? 'Agent' : 'Customer'} · {entry.time}
                                    </span>
                                    <div className={`px-3 md:px-4 py-2 md:py-2.5 rounded-2xl text-[12px] md:text-[13px] leading-relaxed ${entry.speaker === 'agent' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'}`}>
                                        {entry.text}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Interim text bubble — always agent */}
                        {interimText && callActive && (
                            <div className="flex gap-2 md:gap-3 flex-row-reverse">
                                <div className="shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold animate-pulse bg-indigo-300 text-white">
                                    A
                                </div>
                                <div className="px-3 md:px-4 py-2 md:py-2.5 rounded-2xl text-[12px] md:text-[13px] leading-relaxed italic opacity-70 max-w-[85%] md:max-w-[68%] bg-indigo-200 text-indigo-800 rounded-tr-sm">
                                    {interimText}
                                    <span className="inline-block w-1 h-3 ml-1 bg-current opacity-60 animate-pulse rounded-sm" />
                                </div>
                            </div>
                        )}

                        <div ref={transcriptEndRef} />
                    </div>

                    {/* Recording status bar */}
                    {callActive && (
                        <div className="border-t border-slate-200 bg-white px-4 md:px-8 py-2 md:py-3 shrink-0">
                            <div className="flex items-center justify-between max-w-4xl mx-auto">
                                <p className="text-[9px] md:text-[11px] text-slate-400 font-medium truncate pr-4">Agent speech recorded by your mic.</p>
                                <div className="flex items-center gap-1.5 md:gap-2 text-[8px] md:text-[10px] uppercase tracking-widest font-bold text-slate-400 shrink-0">
                                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-400 rounded-full animate-pulse" />
                                    {isMuted ? 'Muted' : 'Recording'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Post-call bar */}
                    {!callActive && transcript.length > 0 && (
                        <div className="border-t border-slate-200 bg-white px-4 md:px-8 py-3 md:py-4 flex flex-wrap items-center gap-2 md:gap-4 shrink-0">
                            <p className="text-[10px] md:text-xs text-slate-500 font-medium w-full sm:w-auto">{transcript.length} entries</p>
                            <button
                                onClick={generateSummary}
                                disabled={summaryLoading}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 md:px-4 py-2 bg-indigo-600 text-white text-[10px] md:text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50"
                            >
                                {summaryLoading ? '⏳ AI...' : '✨ Generate AI Summary'}
                            </button>
                            <button onClick={() => { setTranscript([]); setAiCoaching(null); setSummaryText(null) }} className="px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold text-slate-400 hover:text-red-500 transition-colors">
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                {/* ─── Coaching Sidebar — desktop version ─── */}
                <aside className="w-[320px] bg-slate-50 border-l border-slate-200 overflow-y-auto px-5 py-5 shrink-0 hidden xl:flex flex-col gap-5">
                    <SidebarContent
                        aiLoading={aiLoading}
                        aiError={aiError}
                        aiCoaching={aiCoaching}
                        knowledgeSnippets={knowledgeSnippets}
                        smartReplies={smartReplies}
                        speakReply={speakReply}
                        callActive={callActive}
                        ttsPlaying={ttsPlaying}
                        apiUrl={API_URL}
                    />
                </aside>

                {/* ─── Coaching Sidebar — Mobile/Tablet Drawer ─── */}
                <div
                    className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 transition-opacity xl:hidden ${showMobileCoaching ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    onClick={() => setShowMobileCoaching(false)}
                >
                    <aside
                        className={`absolute right-0 top-0 h-full w-[300px] xs:w-[320px] bg-slate-50 shadow-2xl transition-transform duration-300 flex flex-col p-5 gap-5 ${showMobileCoaching ? 'translate-x-0' : 'translate-x-full'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between shrink-0 mb-1">
                            <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">AI Coaching</h2>
                            <button onClick={() => setShowMobileCoaching(false)} className="p-1 px-2 bg-slate-200 rounded-lg text-slate-500 font-bold text-xs uppercase">Close</button>
                        </div>
                        <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pr-1 custom-scrollbar">
                            <SidebarContent
                                aiLoading={aiLoading}
                                aiError={aiError}
                                aiCoaching={aiCoaching}
                                knowledgeSnippets={knowledgeSnippets}
                                smartReplies={smartReplies}
                                speakReply={speakReply}
                                callActive={callActive}
                                ttsPlaying={ttsPlaying}
                                apiUrl={API_URL}
                            />
                        </div>
                    </aside>
                </div>
            </main>

            {/* Summary Overlay */}
            {showSummary && summaryText && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 md:p-6 z-[60]">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-indigo-500/20 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 md:px-8 py-5 md:py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-gradient-to-r from-slate-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100 italic font-black">AI</div>
                                <div>
                                    <h2 className="font-black text-slate-800 leading-tight uppercase tracking-tight text-sm md:text-base">Post-Call Report</h2>
                                    <p className="text-[10px] md:text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Summary by Gemini 1.5 Flash</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSummary(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 text-sm md:text-base leading-relaxed text-slate-700 whitespace-pre-wrap font-medium">
                            {summaryText}
                        </div>
                        <div className="px-6 md:px-8 py-4 md:py-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(summaryText)
                                    alert('Summary copied to clipboard!')
                                }}
                                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs md:text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 active:scale-95"
                            >
                                Copy Summary to Clipboard
                            </button>
                            <span className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest">AgentOS System Report</span>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}

// ─── Sidebar Content Helper ───
const SidebarContent: React.FC<{
    aiLoading: boolean;
    aiError: boolean;
    aiCoaching: AiCoaching | null;
    knowledgeSnippets: KnowledgeSnippet[];
    smartReplies: string[];
    speakReply: (text: string) => void;
    callActive: boolean;
    ttsPlaying: string | null;
    apiUrl: string;
}> = ({ aiLoading, aiError, aiCoaching, knowledgeSnippets, smartReplies, speakReply, callActive, ttsPlaying, apiUrl }) => {
    return (
        <>
            {/* AI Status */}
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Live Coaching</span>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold ${aiLoading ? 'bg-amber-50 text-amber-600' : aiError ? 'bg-rose-50 text-rose-500' : aiCoaching ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {aiLoading ? 'Thinking...' : aiError ? 'Error' : aiCoaching ? 'Gemini✨' : 'Waiting'}
                </div>
            </div>

            {/* Next Action */}
            <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">🎧 Next Action</h3>
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-[12px] text-indigo-800 font-semibold leading-relaxed">
                        {aiCoaching?.nextAction || 'Awaiting conversation...'}
                    </p>
                </div>
            </section>

            {/* Knowledge Assist */}
            <KnowledgeSidebar autoSnippets={knowledgeSnippets} apiUrl={apiUrl} />

            {/* Insights */}
            {(aiCoaching?.insights?.length || 0) > 0 && (
                <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Insights</h3>
                    <div className="space-y-2">
                        {aiCoaching!.insights.map((ins, i) => (
                            <div key={i} className={`p-3 rounded-xl border text-[11px] ${insightColors[ins.color] || insightColors.blue}`}>
                                <p className="font-bold mb-0.5">🎧 {ins.label}</p>
                                <p className="opacity-80">{ins.tip}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Smart Replies */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Replies</h3>
                    <span className="text-[9px] text-slate-400 font-medium">Click → TTS</span>
                </div>
                <div className="space-y-2">
                    {smartReplies.map((reply, i) => (
                        <button
                            key={i}
                            onClick={() => callActive && speakReply(reply)}
                            disabled={!callActive || ttsPlaying === reply}
                            className={`w-full text-left p-2.5 rounded-xl border text-[10px] md:text-[11px] transition-all bg-white hover:border-indigo-200 text-slate-600 active:scale-[0.98] ${ttsPlaying === reply ? 'ring-2 ring-indigo-300 bg-indigo-50' : ''}`}
                        >
                            {ttsPlaying === reply && <span className="mr-1.5">🔊</span>}
                            {reply}
                        </button>
                    ))}
                </div>
            </section>

            {/* Sentiment */}
            <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Sentiment</h3>
                <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase text-slate-500">{aiCoaching?.sentiment || 'Neutral'}</span>
                </div>
            </section>

            {/* Escalation Risk */}
            {aiCoaching && (
                <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Risk: {aiCoaching.escalationRisk}%</h3>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${aiCoaching.escalationRisk}%` }} />
                    </div>
                </section>
            )}
        </>
    )
}

export default VoiceAgent

