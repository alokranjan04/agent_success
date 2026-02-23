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

    const recognitionRef = useRef<any>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const transcriptEndRef = useRef<HTMLDivElement>(null)
    const coachingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ──── Customer → Agent: receive entries the customer speaks ────
    useEffect(() => {
        socket.on('voice_new_entry', ({ entry }: { entry: { id: string; speaker: string; text: string; time: string } }) => {
            // Only add if it's from the customer (agent's own entries are already added locally)
            if (entry.speaker === 'customer') {
                setTranscript(prev => [...prev, entry as any])
            }
        })
        return () => { socket.off('voice_new_entry') }
    }, [])

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
                const res = await fetch('${API_URL}/api/coaching', {
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

    // ──── Start Call ────
    const startCall = useCallback(() => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRec) return

        setCallActive(true)
        setTranscript([])
        setInterimText('')
        setCallTimer(0)
        setAiCoaching(null)

        socket.emit('voice_start', { sessionId, callerName })

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
        setInterimText('')
        socket.emit('voice_end', { sessionId })
    }, [sessionId])

    // ──── Mute toggle ────
    const toggleMute = () => {
        setIsMuted(m => {
            if (!m && recognitionRef.current) recognitionRef.current.stop()
            else if (m && recognitionRef.current) {
                try { recognitionRef.current.start() } catch (_) { }
            }
            return !m
        })
    }

    // ──── Google TTS Playback ────
    const speakReply = async (text: string) => {
        setTtsPlaying(text)
        try {
            const res = await fetch('${API_URL}/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            })
            const data = await res.json()
            if (data.audioContent) {
                const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`)
                audio.onended = () => setTtsPlaying(null)
                audio.play()
                // Log to transcript as agent speech
                const entry: TranscriptEntry = {
                    id: `tts-${Date.now()}`,
                    speaker: 'agent',
                    text,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                }
                setTranscript(prev => [...prev, entry])
                socket.emit('voice_transcript', { sessionId, entry })
            } else {
                setTtsPlaying(null)
            }
        } catch {
            setTtsPlaying(null)
        }
    }

    // ──── Generate Gemini Summary ────
    const generateSummary = async () => {
        if (!transcript.length) return
        setSummaryLoading(true)
        try {
            const transcriptText = transcript
                .map(e => `${e.speaker.toUpperCase()} [${e.time}]: ${e.text}`)
                .join('\n')
            const res = await fetch('${API_URL}/api/voice/summary', {
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

            {/* ─── Top Nav ─── */}
            <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-30">
                <div className="flex items-center gap-3">
                    <a href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        <span className="text-xs font-medium">Back</span>
                    </a>
                    <div className="h-4 w-px bg-slate-200" />
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-800 tracking-tight">Voice Agent</span>
                    </div>
                    {callActive && (
                        <div className="flex items-center gap-1.5 bg-red-50 text-red-500 px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ring-red-100 ml-2">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            LIVE · {formatTimer(callTimer)}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4 border-l border-slate-200 pl-6">
                    <a href="/customer" target="_blank" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">Customer View</a>
                    <a href="/admin" target="_blank" className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">Admin</a>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden">

                {/* ─── Transcript Panel ─── */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Call Banner */}
                    <div className={`px-8 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 transition-all duration-300 ${callActive ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-white'}`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${callActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {callerName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                {callActive ? (
                                    <>
                                        <p className="font-bold text-sm">{callerName}</p>
                                        <p className="text-xs opacity-75 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                                            Connected · Google Speech Recognition active
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <input
                                            className="font-bold text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 border-b border-dashed border-slate-300 focus:border-indigo-400 pb-0.5 w-52"
                                            placeholder="Enter caller name..."
                                            value={callerName}
                                            onChange={e => setCallerName(e.target.value)}
                                        />
                                        <p className="text-[10px] text-slate-400 mt-0.5">Ready to start call</p>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
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
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold transition-all ${linkCopied
                                            ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-400/40'
                                            : 'bg-white/20 hover:bg-white/30 text-white'}`}
                                    >
                                        {linkCopied ? '✅ Copied!' : '🔗 Copy Customer Link'}
                                    </button>
                                    <button
                                        onClick={toggleMute}
                                        title={isMuted ? 'Unmute' : 'Mute'}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-400/80 ring-2 ring-white/50' : 'bg-white/20 hover:bg-white/30'}`}
                                    >
                                        {isMuted
                                            ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                            : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                                        }
                                    </button>
                                    <button onClick={endCall} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full text-xs font-bold transition-all shadow-lg shadow-red-500/30 active:scale-95">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" /></svg>
                                        End Call
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={startCall}
                                    disabled={!sttSupported}
                                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-full text-sm font-bold transition-all shadow-lg shadow-emerald-500/30 active:scale-95"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" /></svg>
                                    Start Call
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Chrome warning */}
                    {!sttSupported && (
                        <div className="mx-8 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-xs font-medium">
                            ⚠️ Google Speech Recognition requires <strong>Chrome</strong>. Please open this page in Chrome.
                        </div>
                    )}

                    {/* Transcript */}
                    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
                        {transcript.length === 0 && !callActive && (
                            <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-4xl mb-5 shadow-inner">🎙️</div>
                                <h3 className="text-lg font-bold text-slate-700">Ready to take a call</h3>
                                <p className="text-slate-400 text-sm mt-2 max-w-sm">Click <strong>Start Call</strong> to begin. Google Speech Recognition transcribes the conversation; Gemini AI provides live coaching tags and smart replies based on your configurable prompt.</p>
                                <div className="mt-6 grid grid-cols-3 gap-3 max-w-sm w-full">
                                    {['🎙️ Live Transcript', '🧠 Gemini Coaching', '🔊 Google TTS'].map(f => (
                                        <div key={f} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                                            <p className="text-[11px] font-bold text-slate-600">{f}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {transcript.map(entry => (
                            <div key={entry.id} className={`flex gap-3 ${entry.speaker === 'agent' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${entry.speaker === 'agent' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                    {entry.speaker === 'agent' ? 'A' : 'C'}
                                </div>
                                <div className={`max-w-[68%] flex flex-col gap-1 ${entry.speaker === 'agent' ? 'items-end' : 'items-start'}`}>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider ${entry.speaker === 'agent' ? 'text-indigo-500' : 'text-slate-400'}`}>
                                        {entry.speaker === 'agent' ? 'Agent' : 'Customer'} · {entry.time}
                                    </span>
                                    <div className={`px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${entry.speaker === 'agent' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'}`}>
                                        {entry.text}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Interim text bubble — always agent */}
                        {interimText && callActive && (
                            <div className="flex gap-3 flex-row-reverse">
                                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold animate-pulse bg-indigo-300 text-white">
                                    A
                                </div>
                                <div className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed italic opacity-70 max-w-[68%] bg-indigo-200 text-indigo-800 rounded-tr-sm">
                                    {interimText}
                                    <span className="inline-block w-1 h-3 ml-1 bg-current opacity-60 animate-pulse rounded-sm" />
                                </div>
                            </div>
                        )}

                        <div ref={transcriptEndRef} />
                    </div>

                    {/* Recording status bar */}
                    {callActive && (
                        <div className="border-t border-slate-200 bg-white px-8 py-3 shrink-0">
                            <div className="flex items-center justify-between max-w-2xl mx-auto">
                                <p className="text-[11px] text-slate-500 font-medium">Your mic records <strong>agent speech</strong>. Customer speech appears automatically from their screen.</p>
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                                    Google Speech · {isMuted ? 'Muted' : 'Recording'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Post-call bar */}
                    {!callActive && transcript.length > 0 && (
                        <div className="border-t border-slate-200 bg-white px-8 py-4 flex items-center gap-4 shrink-0">
                            <p className="text-xs text-slate-500 font-medium">{transcript.length} transcript entries</p>
                            <button
                                onClick={generateSummary}
                                disabled={summaryLoading}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50"
                            >
                                {summaryLoading ? '⏳ Generating...' : '✨ Generate AI Summary (Gemini)'}
                            </button>
                            <button onClick={() => { setTranscript([]); setAiCoaching(null); setSummaryText(null) }} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-red-500 transition-colors">
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                {/* ─── Coaching Sidebar ─── */}
                <aside className="w-[320px] bg-slate-50 border-l border-slate-200 overflow-y-auto px-5 py-5 shrink-0 hidden xl:flex flex-col gap-5">

                    {/* AI Status indicator */}
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Live Coaching</span>
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold ${aiLoading ? 'bg-amber-50 text-amber-600' : aiError ? 'bg-rose-50 text-rose-500' : aiCoaching ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {aiLoading
                                ? <><span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />Gemini thinking...</>
                                : aiError
                                    ? <><span className="w-1.5 h-1.5 bg-rose-400 rounded-full" />AI unavailable</>
                                    : aiCoaching
                                        ? <><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />Gemini ✨</>
                                        : <><span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />Waiting for call</>
                            }
                        </div>
                    </div>

                    {/* Next Best Action — Gemini coaching tag */}
                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">🎧 Next Best Action</h3>
                        {aiLoading && !aiCoaching ? (
                            <div className="bg-slate-100 rounded-xl p-4 animate-pulse">
                                <div className="h-3 bg-slate-200 rounded w-3/4 mb-2" />
                                <div className="h-3 bg-slate-200 rounded w-1/2" />
                            </div>
                        ) : (
                            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
                                <p className="text-[12px] text-indigo-800 leading-relaxed font-semibold">
                                    {aiCoaching?.nextAction || 'Ask caller for Name, Phone, and Email to verify their account.'}
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Knowledge Assist — RAG results */}
                    <KnowledgeSidebar autoSnippets={knowledgeSnippets} apiUrl={API_URL} />

                    {/* Coaching Insights — QA tags from Gemini */}
                    {(aiCoaching?.insights?.length || 0) > 0 && (
                        <section>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Coaching Insights</h3>
                            <div className="space-y-2">
                                {aiCoaching!.insights.map((ins, i) => (
                                    <div key={i} className={`p-3 rounded-xl border text-[11px] leading-relaxed ${insightColors[ins.color] || insightColors.blue}`}>
                                        <p className="font-bold mb-0.5">🎧 {ins.label}</p>
                                        <p className="opacity-80">{ins.tip}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Smart Replies — click to speak via Google TTS */}
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Suggested Replies</h3>
                            <span className="text-[9px] text-slate-400 font-medium">Click → Google TTS</span>
                        </div>
                        {aiLoading && !aiCoaching ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 animate-pulse">
                                        <div className="h-2.5 bg-slate-100 rounded w-full mb-1" />
                                        <div className="h-2.5 bg-slate-100 rounded w-4/5" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {smartReplies.map((reply, i) => (
                                    <button
                                        key={i}
                                        onClick={() => callActive && speakReply(reply)}
                                        disabled={!callActive || ttsPlaying === reply}
                                        className={`w-full text-left p-3 rounded-xl border text-[11px] font-medium leading-relaxed transition-all ${callActive
                                            ? 'bg-white hover:bg-indigo-50 border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-700 cursor-pointer shadow-sm active:scale-[0.98]'
                                            : 'bg-white border-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                                            } ${ttsPlaying === reply ? 'ring-2 ring-indigo-300 bg-indigo-50' : ''}`}
                                    >
                                        {ttsPlaying === reply && <span className="mr-1.5">🔊</span>}
                                        {reply}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Sentiment */}
                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Sentiment</h3>
                        <div className={`p-4 rounded-xl border flex items-center gap-3 ${sc.bg} ${sc.border} ${sc.text}`}>
                            <span className="text-xl">{sc.emoji}</span>
                            <span className="text-xs font-bold uppercase">{aiCoaching?.sentiment || 'Neutral'}</span>
                            {aiLoading && <span className="ml-auto text-[9px] opacity-60 animate-pulse">updating...</span>}
                        </div>
                    </section>

                    {/* Escalation Risk */}
                    {aiCoaching && (
                        <section>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Escalation Risk</h3>
                            <div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                    <span>{aiCoaching.escalationRisk > 60 ? '⚠️ High' : aiCoaching.escalationRisk > 30 ? '⚡ Moderate' : '✅ Low'}</span>
                                    <span>{aiCoaching.escalationRisk}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${aiCoaching.escalationRisk > 60 ? 'bg-rose-500' : aiCoaching.escalationRisk > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${aiCoaching.escalationRisk}%` }}
                                    />
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Configure link */}
                    <div className="mt-auto pt-4 border-t border-slate-200">
                        <a href="/admin" target="_blank" className="flex items-center gap-2 text-[10px] text-slate-400 hover:text-indigo-500 font-medium transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Configure coaching prompt in Admin → System Prompt
                        </a>
                    </div>
                </aside>
            </main>

            {/* ─── Summary Modal ─── */}
            {showSummary && summaryText && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800">Call Summary</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Generated by Gemini AI · Powered by configurable summary prompt</p>
                            </div>
                            <button onClick={() => setShowSummary(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap font-mono">{summaryText}</div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => navigator.clipboard.writeText(summaryText)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">Copy</button>
                            <button onClick={() => setShowSummary(false)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VoiceAgent

