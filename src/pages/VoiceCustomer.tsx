import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || ''
const socket = io(API_URL || window.location.origin)


type TranscriptEntry = {
    id: string
    speaker: 'agent' | 'customer'
    text: string
    time: string
}

declare global {
    interface Window {
        SpeechRecognition: any
        webkitSpeechRecognition: any
    }
}

// Read ?session=xxx from URL
function getSessionFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get('session')
}

const VoiceCustomer: React.FC = () => {
    const urlSession = getSessionFromUrl()

    const [sessionId] = useState(urlSession || `voice-${Date.now()}`)
    const [callActive, setCallActive] = useState(false)
    const [callTimer, setCallTimer] = useState(0)
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
    const [interimText, setInterimText] = useState('')
    const [isMuted, setIsMuted] = useState(false)
    const [callEnded, setCallEnded] = useState(false)
    const [sttSupported, setSttSupported] = useState(true)
    const [agentName, setAgentName] = useState('Support Agent')

    const recognitionRef = useRef<any>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const transcriptEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [transcript, interimText])

    // STT support check
    useEffect(() => {
        if (!window.SpeechRecognition && !window.webkitSpeechRecognition) setSttSupported(false)
    }, [])

    // Fetch agent name for display
    useEffect(() => {
        fetch('${API_URL}/api/admin/config')
            .then(r => r.json())
            .then(c => { if (c.agentName) setAgentName(c.agentName) })
            .catch(() => { })
    }, [])

    // Socket events — join session room if URL has ?session=
    useEffect(() => {
        if (urlSession) {
            // Join existing session started by agent; server sends voice_history
            socket.emit('voice_join', { sessionId: urlSession })
        }

        socket.on('voice_history', (entries: TranscriptEntry[]) => {
            setTranscript(entries)
        })

        // Receive agent's transcript entries in real time
        socket.on('voice_new_entry', ({ entry }: { entry: TranscriptEntry }) => {
            setTranscript(prev => [...prev, entry])
        })

        // Agent ended the call
        socket.on('voice_session_ended', () => {
            endCall()
            setCallEnded(true)
        })

        return () => {
            socket.off('voice_history')
            socket.off('voice_new_entry')
            socket.off('voice_session_ended')
        }
    }, [urlSession])

    // Start call
    const startCall = useCallback(() => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRec) return

        setCallActive(true)
        setCallEnded(false)
        setCallTimer(0)

        // If no URL session, create a new one
        if (!urlSession) socket.emit('voice_start', { sessionId, callerName: 'Customer' })

        timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)

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
                        speaker: 'customer',
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
    }, [sessionId, urlSession])

    // End call
    const endCall = useCallback(() => {
        setCallActive(false)
        if (timerRef.current) clearInterval(timerRef.current)
        if (recognitionRef.current) {
            recognitionRef.current.onend = null
            recognitionRef.current.stop()
            recognitionRef.current = null
        }
        setInterimText('')
    }, [])

    const toggleMute = () => {
        setIsMuted(m => {
            if (!m && recognitionRef.current) recognitionRef.current.stop()
            else if (m && recognitionRef.current) {
                try { recognitionRef.current.start() } catch (_) { }
            }
            return !m
        })
    }

    const formatTimer = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md flex flex-col" style={{ height: '90vh', maxHeight: 760 }}>

                {/* ─── Header ─── */}
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10 px-5 py-4 mb-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-900/40">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-white text-sm">Customer Support</p>
                            <p className="text-[10px] text-white/50 font-medium">Agent: {agentName} · Inbound</p>
                        </div>
                    </div>

                    {callActive ? (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                {formatTimer(callTimer)}
                            </div>
                        </div>
                    ) : callEnded ? (
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-900/30 px-2.5 py-1 rounded-full">Call Ended</span>
                    ) : (
                        <span className="text-[10px] font-bold text-white/40 bg-white/10 px-2.5 py-1 rounded-full">Ready</span>
                    )}
                </div>

                {/* ─── Transcript ─── */}
                <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-y-auto px-4 py-4 space-y-3 mb-3">

                    {transcript.length === 0 && !callActive && !callEnded && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                            <div className="text-5xl mb-4">📞</div>
                            <p className="text-white/70 font-bold text-base">You're connected to support</p>
                            <p className="text-white/40 text-[12px] mt-2 max-w-xs leading-relaxed">
                                {urlSession ? 'An agent is ready. Tap the button below and describe your issue.' : 'Tap the button below and tell us what\'s happening.'}
                            </p>
                            <div className="mt-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/30 text-[11px] max-w-xs">
                                💡 Tip: Speak clearly — describe your issue and we'll help straight away
                            </div>
                        </div>
                    )}

                    {callEnded && transcript.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                            <div className="text-5xl mb-4">📞</div>
                            <p className="text-white/60 font-semibold text-sm">Call has ended</p>
                        </div>
                    )}

                    {/* Transcript entries */}
                    {transcript.map(entry => (
                        <div key={entry.id} className={`flex gap-2 ${entry.speaker === 'customer' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${entry.speaker === 'agent' ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                {entry.speaker === 'agent' ? 'A' : 'Y'}
                            </div>
                            <div className={`max-w-[80%] flex flex-col gap-0.5 ${entry.speaker === 'customer' ? 'items-end' : 'items-start'}`}>
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${entry.speaker === 'customer' ? 'text-emerald-400/60' : 'text-indigo-300/60'}`}>
                                    {entry.speaker === 'customer' ? 'You' : agentName} · {entry.time}
                                </span>
                                <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${entry.speaker === 'customer'
                                    ? 'bg-emerald-500 text-white rounded-tr-sm'
                                    : 'bg-white/15 text-white/90 rounded-tl-sm border border-white/10'
                                    }`}>
                                    {entry.text}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Interim bubble */}
                    {interimText && callActive && (
                        <div className="flex gap-2 flex-row-reverse">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-400 flex items-center justify-center text-[11px] font-bold text-white animate-pulse">Y</div>
                            <div className="max-w-[80%] items-end flex flex-col">
                                <div className="px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed bg-emerald-400/40 text-white/70 italic rounded-tr-sm border border-emerald-400/30">
                                    {interimText}
                                    <span className="inline-block w-1 h-3 ml-1 bg-emerald-400 opacity-60 animate-pulse rounded-sm" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Agent typing indicator */}
                    {callActive && !callEnded && transcript.length > 0 && transcript[transcript.length - 1]?.speaker === 'customer' && (
                        <div className="flex gap-2">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-[11px] font-bold text-white">A</div>
                            <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center border border-white/10">
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
                            </div>
                        </div>
                    )}

                    <div ref={transcriptEndRef} />
                </div>

                {/* ─── Controls ─── */}
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10 p-4 shrink-0">
                    {!sttSupported && (
                        <p className="text-amber-300 text-[11px] text-center mb-3 font-medium">
                            ⚠️ Please open in <strong>Chrome</strong> for Google Speech Recognition
                        </p>
                    )}

                    {callEnded ? (
                        <div className="text-center">
                            <p className="text-white/50 text-sm mb-3">The agent has ended the call.</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-all"
                            >
                                Start New Call
                            </button>
                        </div>
                    ) : !callActive ? (
                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={startCall}
                                disabled={!sttSupported}
                                className="w-full flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/40 active:scale-95"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                                Speak — Tell Us Your Issue
                            </button>
                            <p className="text-[10px] text-white/30 font-medium">Your voice will be transcribed and heard by the agent</p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-3">
                            {/* Mute */}
                            <button
                                onClick={toggleMute}
                                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all flex-1 justify-center ${isMuted
                                    ? 'bg-red-500/30 text-red-300 border border-red-500/30'
                                    : 'bg-white/10 text-white/70 hover:bg-white/20 border border-white/10'
                                    }`}
                            >
                                {isMuted ? '🔇 Muted' : '🎙️ Speaking'}
                            </button>

                            {/* End call */}
                            <button
                                onClick={() => { endCall(); setCallEnded(true) }}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 transition-all flex-1 justify-center"
                            >
                                📵 End Call
                            </button>
                        </div>
                    )}
                </div>

                {/* Info bar */}
                <p className="text-center text-white/20 text-[10px] font-medium mt-2">
                    Powered by AgentOS · Google Speech Recognition
                </p>
            </div>
        </div>
    )
}

export default VoiceCustomer

