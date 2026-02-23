import React, { useState, useEffect, useRef } from 'react'
import { getAdminTheme, setAdminTheme } from '../lib/firebase'

type Policy = { id: string; name: string; description: string; enabled: boolean; priority: string }
type Document = { id: string; name: string; filename: string; size: number; type: string; uploadedAt: string; status: string }

const API = `${import.meta.env.VITE_API_URL || ''}/api/admin`


/* ──────────────── Inline SVG Icon Component ──────────────── */
const Icon = ({ name, className = 'w-4 h-4' }: { name: string; className?: string }) => {
    const icons: Record<string, React.ReactNode> = {
        settings: <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
        code: <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />,
        shield: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
        document: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
        back: <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />,
        chat: <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
        trash: <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
        plus: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />,
        check: <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />,
        upload: <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />,
        save: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />,
        sun: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />,
        moon: <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />,
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {icons[name]}
        </svg>
    )
}

const AdminPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'general' | 'prompt' | 'coaching' | 'documents'>('general')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(true)

    // Theme — persisted to Firebase Firestore
    const [dark, setDark] = useState(true)
    useEffect(() => {
        getAdminTheme().then(theme => setDark(theme === 'dark'))
    }, [])
    const toggleTheme = () => {
        const newDark = !dark
        setDark(newDark)
        setAdminTheme(newDark ? 'dark' : 'light')
    }

    // Theme helper — picks dark or light value
    const t = (d: string, l: string) => dark ? d : l

    // General config
    const [companyName, setCompanyName] = useState('AgentOS')
    const [agentName, setAgentName] = useState('Support Agent')
    const [welcomeMessage, setWelcomeMessage] = useState('')
    const [maxResponseTime, setMaxResponseTime] = useState(120)
    const [autoGreeting, setAutoGreeting] = useState(true)
    const [enableTTS, setEnableTTS] = useState(true)
    const [enableTypingIndicator, setEnableTypingIndicator] = useState(true)
    const [language, setLanguage] = useState('en-US')
    const [tone, setTone] = useState('professional')

    // System prompt
    const [systemPrompt, setSystemPrompt] = useState('')
    const [summaryPrompt, setSummaryPrompt] = useState('')
    const [coachingPrompt, setCoachingPrompt] = useState('')

    // Coaching policies
    const [policies, setPolicies] = useState<Policy[]>([])
    const [newPolicyName, setNewPolicyName] = useState('')
    const [newPolicyDesc, setNewPolicyDesc] = useState('')
    const [newPolicyPriority, setNewPolicyPriority] = useState('medium')
    const [showAddPolicy, setShowAddPolicy] = useState(false)

    // Documents
    const [documents, setDocuments] = useState<Document[]>([])
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetch(`${API}/config`)
            .then(r => r.json())
            .then(c => {
                setCompanyName(c.companyName || 'AgentOS')
                setAgentName(c.agentName || 'Support Agent')
                setWelcomeMessage(c.welcomeMessage || '')
                setMaxResponseTime(c.maxResponseTime || 120)
                setAutoGreeting(c.autoGreeting !== false)
                setEnableTTS(c.enableTTS !== false)
                setEnableTypingIndicator(c.enableTypingIndicator !== false)
                setLanguage(c.language || 'en-US')
                setTone(c.tone || 'professional')
                setSystemPrompt(c.systemPrompt || '')
                setSummaryPrompt(c.summaryPrompt || '')
                setCoachingPrompt(c.coachingPrompt || '')
                setPolicies(c.coachingPolicies || [])
                setDocuments(c.documents || [])
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    const saveConfig = async () => {
        setSaving(true)
        await fetch(`${API}/config`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, companyName, agentName, welcomeMessage, maxResponseTime, autoGreeting, enableTTS, enableTypingIndicator, language, tone, summaryPrompt, coachingPrompt })
        })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const addPolicy = async () => {
        if (!newPolicyName.trim()) return
        const res = await fetch(`${API}/policies`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newPolicyName, description: newPolicyDesc, enabled: true, priority: newPolicyPriority })
        })
        const data = await res.json()
        if (data.success) { setPolicies(prev => [...prev, data.policy]); setNewPolicyName(''); setNewPolicyDesc(''); setNewPolicyPriority('medium'); setShowAddPolicy(false) }
    }

    const togglePolicy = async (id: string) => {
        const p = policies.find(p => p.id === id); if (!p) return
        await fetch(`${API}/policies/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !p.enabled }) })
        setPolicies(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))
    }

    const deletePolicy = async (id: string) => { await fetch(`${API}/policies/${id}`, { method: 'DELETE' }); setPolicies(prev => prev.filter(p => p.id !== id)) }

    const uploadFile = async (file: File) => {
        setUploading(true)
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch(`${API}/documents`, { method: 'POST', body: fd })
        const data = await res.json()
        if (data.success) setDocuments(prev => [...prev, data.document])
        setUploading(false)
    }

    const deleteDocument = async (id: string) => { await fetch(`${API}/documents/${id}`, { method: 'DELETE' }); setDocuments(prev => prev.filter(d => d.id !== id)) }

    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]) }

    const clearChatHistory = async () => { if (confirm('Clear all chat history?')) await fetch(`${API}/chat-history`, { method: 'DELETE' }) }

    const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`

    const tabs = [
        { id: 'general' as const, label: 'General', icon: 'settings' },
        { id: 'prompt' as const, label: 'System Prompt', icon: 'code' },
        { id: 'coaching' as const, label: 'Coaching Policies', icon: 'shield' },
        { id: 'documents' as const, label: 'Knowledge Base', icon: 'document' },
    ]

    // ─── Theme tokens ───
    const bg = t('bg-[#0f1117]', 'bg-gray-50')
    const bgSidebar = t('bg-[#13151d]', 'bg-white')
    const bgCard = t('bg-[#1a1d27]', 'bg-white')
    const bgInput = t('bg-[#0f1117]', 'bg-gray-50')
    const borderSide = t('border-white/5', 'border-gray-200')
    const borderCard = t('border-white/5', 'border-gray-200')
    const borderInput = t('border-white/10', 'border-gray-300')
    const textHeading = t('text-white', 'text-gray-900')
    const textPrimary = t('text-slate-200', 'text-gray-800')
    const textSecondary = t('text-slate-400', 'text-gray-600')
    const textMuted = t('text-slate-500', 'text-gray-500')
    const textDim = t('text-slate-600', 'text-gray-400')
    const navActive = t('bg-indigo-500/10 text-indigo-400', 'bg-indigo-50 text-indigo-600')
    const navInactive = t('text-slate-400 hover:bg-white/5 hover:text-slate-300', 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')
    const footerLink = t('text-slate-500 hover:bg-white/5 hover:text-slate-300', 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')
    const inputCls = `w-full ${bgInput} border ${borderInput} rounded-lg px-3.5 py-2.5 text-[13px] ${textPrimary} focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all`
    const selectCls = `w-full ${bgInput} border ${borderInput} rounded-lg px-3 py-2.5 text-[13px] ${textPrimary} focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all`
    const toggleRow = `flex items-center justify-between ${bgInput} rounded-lg px-4 py-3 border ${t('border-white/5', 'border-gray-200')}`

    if (loading) return (
        <div className={`flex items-center justify-center h-screen ${bg}`}>
            <div className="flex flex-col items-center gap-4">
                <div className={`w-8 h-8 border-3 ${t('border-indigo-900 border-t-indigo-400', 'border-indigo-200 border-t-indigo-600')} rounded-full animate-spin`}></div>
                <p className={`text-xs ${textMuted} font-medium`}>Loading configuration...</p>
            </div>
        </div>
    )

    return (
        <div className={`flex h-screen ${bg} ${textPrimary} font-sans transition-colors duration-300`}>
            {/* ─── Sidebar ─── */}
            <aside className={`w-56 ${bgSidebar} border-r ${borderSide} flex flex-col transition-colors duration-300`}>
                {/* Logo */}
                <div className={`h-14 flex items-center px-5 border-b ${borderSide}`}>
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mr-2.5 shadow-lg shadow-indigo-500/20">
                        <Icon name="settings" className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                        <p className={`text-[13px] font-bold ${textHeading} tracking-tight`}>Admin</p>
                        <p className={`text-[8px] ${textMuted} font-bold uppercase tracking-widest`}>AgentOS Config</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-0.5">
                    <p className={`text-[9px] font-bold uppercase tracking-widest ${textDim} px-3 pt-2 pb-2`}>Configuration</p>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150 ${activeTab === tab.id ? navActive : navInactive}`}
                        >
                            <Icon name={tab.icon} className="w-4 h-4 shrink-0" />
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {/* Footer links */}
                <div className={`p-3 border-t ${borderSide} space-y-0.5`}>
                    <a href="/" className={`flex items-center gap-2 px-3 py-2 text-[11px] font-medium ${footerLink} rounded-lg transition-colors`}>
                        <Icon name="back" className="w-3.5 h-3.5" /> Agent Console
                    </a>
                    <a href="/customer" className={`flex items-center gap-2 px-3 py-2 text-[11px] font-medium ${footerLink} rounded-lg transition-colors`}>
                        <Icon name="chat" className="w-3.5 h-3.5" /> Customer Chat
                    </a>
                    <button onClick={clearChatHistory} className={`w-full text-left flex items-center gap-2 px-3 py-2 text-[11px] font-medium ${t('text-red-400/70 hover:bg-red-500/10 hover:text-red-400', 'text-red-500/70 hover:bg-red-50 hover:text-red-600')} rounded-lg transition-colors`}>
                        <Icon name="trash" className="w-3.5 h-3.5" /> Clear Chat History
                    </button>
                </div>
            </aside>

            {/* ─── Main ─── */}
            <main className="flex-1 flex flex-col overflow-hidden transition-colors duration-300">
                {/* Header */}
                <header className={`h-14 ${bgSidebar} border-b ${borderSide} flex items-center justify-between px-7 shrink-0 transition-colors duration-300`}>
                    <div>
                        <h2 className={`text-[15px] font-bold ${textHeading}`}>{tabs.find(t => t.id === activeTab)?.label}</h2>
                        <p className={`text-[10px] ${textMuted} mt-0.5`}>
                            {activeTab === 'general' && 'Agent behavior, identity and preferences'}
                            {activeTab === 'prompt' && 'AI system prompt for coaching and smart replies'}
                            {activeTab === 'coaching' && 'Real-time coaching rules and guidelines'}
                            {activeTab === 'documents' && 'Upload training documents and knowledge articles'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className={`p-2 rounded-lg transition-all ${t('bg-white/5 hover:bg-white/10 text-amber-400', 'bg-gray-100 hover:bg-gray-200 text-indigo-600')}`}
                            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            <Icon name={dark ? 'sun' : 'moon'} className="w-4 h-4" />
                        </button>

                        {/* Save Button */}
                        {(activeTab === 'general' || activeTab === 'prompt') && (
                            <button onClick={saveConfig} disabled={saving}
                                className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${saved ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' :
                                    'bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 shadow-lg shadow-indigo-500/25'
                                    }`}
                            >
                                {saving ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                                    : saved ? <><Icon name="check" className="w-3.5 h-3.5" /> Saved!</>
                                        : <><Icon name="save" className="w-3.5 h-3.5" /> Save Changes</>
                                }
                            </button>
                        )}
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-7">
                    <div className="max-w-3xl mx-auto space-y-6">

                        {/* ═══════════ GENERAL ═══════════ */}
                        {activeTab === 'general' && <>
                            {/* Identity */}
                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary} mb-4`}>Identity</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Company Name</label>
                                        <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Agent Display Name</label>
                                        <input value={agentName} onChange={e => setAgentName(e.target.value)} className={inputCls} />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Welcome Message</label>
                                    <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows={2}
                                        className={`${inputCls} resize-none`} placeholder="Default greeting when a customer connects..." />
                                </div>
                            </div>

                            {/* Behavior */}
                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary} mb-4`}>Behavior</h3>
                                <div className="grid grid-cols-3 gap-4 mb-5">
                                    <div>
                                        <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Language</label>
                                        <select value={language} onChange={e => setLanguage(e.target.value)} className={selectCls}>
                                            <option value="en-US">English (US)</option>
                                            <option value="en-GB">English (UK)</option>
                                            <option value="es-ES">Spanish</option>
                                            <option value="fr-FR">French</option>
                                            <option value="de-DE">German</option>
                                            <option value="hi-IN">Hindi</option>
                                            <option value="ja-JP">Japanese</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Tone</label>
                                        <select value={tone} onChange={e => setTone(e.target.value)} className={selectCls}>
                                            <option value="professional">Professional</option>
                                            <option value="friendly">Friendly</option>
                                            <option value="formal">Formal</option>
                                            <option value="casual">Casual</option>
                                            <option value="empathetic">Empathetic</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Max Response (sec)</label>
                                        <input type="number" value={maxResponseTime} onChange={e => setMaxResponseTime(Number(e.target.value))} className={inputCls} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {[
                                        { label: 'Auto-Greeting', desc: 'Send welcome message automatically', val: autoGreeting, set: setAutoGreeting },
                                        { label: 'Text-to-Speech', desc: 'Enable TTS playback for messages', val: enableTTS, set: setEnableTTS },
                                        { label: 'Typing Indicator', desc: 'Show when other party is typing', val: enableTypingIndicator, set: setEnableTypingIndicator },
                                    ].map(tgl => (
                                        <div key={tgl.label} className={toggleRow}>
                                            <div>
                                                <p className={`text-[12px] font-semibold ${t('text-slate-300', 'text-gray-700')}`}>{tgl.label}</p>
                                                <p className={`text-[10px] ${textDim}`}>{tgl.desc}</p>
                                            </div>
                                            <button onClick={() => tgl.set(!tgl.val)}
                                                className={`relative rounded-full transition-colors duration-200 ${tgl.val ? 'bg-indigo-500' : t('bg-slate-700', 'bg-gray-300')}`}
                                                style={{ width: 40, height: 22 }}>
                                                <div className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200 ${tgl.val ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>}

                        {/* ═══════════ SYSTEM PROMPT ═══════════ */}
                        {activeTab === 'prompt' && <>
                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>System Prompt</h3>
                                    <span className={`text-[9px] font-bold ${textDim} ${bgInput} px-2 py-0.5 rounded-full border ${borderCard}`}>{systemPrompt.length} chars</span>
                                </div>
                                <p className={`text-[11px] ${textMuted} mb-4 leading-relaxed`}>This prompt shapes how the AI coaching engine analyzes conversations, generates smart replies, and guides agent behavior.</p>
                                <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={10}
                                    className={`${inputCls} font-mono resize-none leading-relaxed`}
                                    placeholder="Enter the system prompt..." />
                            </div>

                            {/* Quick Templates */}
                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary} mb-4`}>Quick Templates</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { name: 'Customer Support', prompt: 'You are a helpful customer support agent. Be empathetic, professional, and solution-oriented. Always verify customer identity before making account changes. Prioritize customer satisfaction while following company policies.' },
                                        { name: 'Technical Support', prompt: 'You are a technical support specialist. Ask clarifying questions about the issue, collect relevant system information (OS, browser, error codes), and provide step-by-step troubleshooting instructions. Escalate to engineering when needed.' },
                                        { name: 'Sales Assistant', prompt: "You are a knowledgeable sales assistant. Understand the customer's needs, recommend appropriate products/plans, highlight key benefits, and handle objections professionally. Never pressure customers." },
                                        { name: 'Billing Support', prompt: 'You are a billing and accounts specialist. Help customers understand their invoices, process refunds per policy, resolve payment issues, and explain plan pricing clearly. Always verify account ownership first.' },
                                    ].map(tpl => (
                                        <button key={tpl.name} onClick={() => setSystemPrompt(tpl.prompt)}
                                            className={`text-left ${bgInput} ${t('hover:bg-white/5', 'hover:bg-indigo-50')} p-4 rounded-lg border ${t('border-white/5 hover:border-indigo-500/20', 'border-gray-200 hover:border-indigo-300')} transition-all group`}>
                                            <p className={`text-[12px] font-bold ${t('text-slate-300', 'text-gray-700')} group-hover:text-indigo-500 transition-colors`}>{tpl.name}</p>
                                            <p className={`text-[10px] ${textDim} mt-1 line-clamp-2 leading-relaxed`}>{tpl.prompt}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Coaching Prompt</h3>
                                        <p className={`text-[10px] ${textMuted} mt-0.5`}>Drives real-time AI coaching, smart replies, and QA tags during live calls</p>
                                    </div>
                                    <span className={`text-[9px] font-bold ${textDim} ${bgInput} px-2 py-0.5 rounded-full border ${borderCard}`}>{coachingPrompt.length} chars</span>
                                </div>
                                <p className={`text-[11px] ${textMuted} mb-4 leading-relaxed`}>This prompt tells Gemini how to analyze the live conversation and generate coaching tags (e.g. <em>"Emotional Acknowledgement"</em>, <em>"Fairness Framing"</em>), smart reply phrases, and sentiment. Must return valid JSON.</p>
                                <textarea value={coachingPrompt} onChange={e => setCoachingPrompt(e.target.value)} rows={14}
                                    className={`${inputCls} font-mono resize-none leading-relaxed text-[11px]`}
                                    placeholder="Enter the real-time coaching prompt..." />
                            </div>

                            {/* Summary Prompt */}
                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Summary Prompt</h3>
                                    <span className={`text-[9px] font-bold ${textDim} ${bgInput} px-2 py-0.5 rounded-full border ${borderCard}`}>{summaryPrompt.length} chars</span>
                                </div>
                                <p className={`text-[11px] ${textMuted} mb-4 leading-relaxed`}>This prompt is used to generate AI-powered conversation summaries when an agent clicks "Generate Summary" or "End Conversation".</p>
                                <textarea value={summaryPrompt} onChange={e => setSummaryPrompt(e.target.value)} rows={6}
                                    className={`${inputCls} font-mono resize-none leading-relaxed`}
                                    placeholder="Enter the summary generation prompt..." />
                            </div>
                        </>}

                        {/* ═══════════ COACHING POLICIES ═══════════ */}
                        {activeTab === 'coaching' && <>
                            <div className={`${bgCard} rounded-xl border ${borderCard} p-5 transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <div className="flex items-center justify-between mb-5">
                                    <div className="flex items-center gap-2">
                                        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Active Policies</h3>
                                        <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">{policies.length}</span>
                                    </div>
                                    <button onClick={() => setShowAddPolicy(true)}
                                        className="px-3.5 py-1.5 bg-indigo-500 text-white text-[11px] font-bold rounded-lg hover:bg-indigo-600 active:scale-95 transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-500/25">
                                        <Icon name="plus" className="w-3 h-3" /> Add Policy
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {policies.map(p => (
                                        <div key={p.id} className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${p.enabled
                                            ? `${bgInput} ${t('border-white/5', 'border-gray-200')}`
                                            : `${bgInput} ${t('border-white/3', 'border-gray-100')} opacity-50`
                                            }`}>
                                            <button onClick={() => togglePolicy(p.id)} className="mt-0.5 shrink-0">
                                                <div className={`rounded border-2 flex items-center justify-center transition-all ${p.enabled ? 'bg-indigo-500 border-indigo-500' : t('border-slate-600', 'border-gray-400')}`}
                                                    style={{ width: 18, height: 18 }}>
                                                    {p.enabled && <Icon name="check" className="w-2.5 h-2.5 text-white" />}
                                                </div>
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <h4 className={`text-[12px] font-bold ${t('text-slate-300', 'text-gray-700')}`}>{p.name}</h4>
                                                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${p.priority === 'critical' ? 'bg-red-500/10 text-red-500' :
                                                        p.priority === 'high' ? 'bg-amber-500/10 text-amber-500' :
                                                            t('bg-slate-500/10 text-slate-500', 'bg-gray-200 text-gray-500')
                                                        }`}>{p.priority}</span>
                                                </div>
                                                <p className={`text-[11px] ${textMuted} leading-relaxed`}>{p.description}</p>
                                            </div>
                                            <button onClick={() => deletePolicy(p.id)} className={`${textDim} hover:text-red-500 transition-colors p-1 shrink-0`}>
                                                <Icon name="trash" className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add Policy Modal */}
                            {showAddPolicy && (
                                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddPolicy(false)}>
                                    <div className={`${bgCard} rounded-xl shadow-2xl w-full max-w-md p-6 border ${t('border-white/10', 'border-gray-300')}`} onClick={e => e.stopPropagation()}>
                                        <h3 className={`text-sm font-bold ${textHeading} mb-5`}>Add Coaching Policy</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Policy Name</label>
                                                <input value={newPolicyName} onChange={e => setNewPolicyName(e.target.value)} className={inputCls} placeholder="e.g., Data Privacy Protocol" />
                                            </div>
                                            <div>
                                                <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Description / Rule</label>
                                                <textarea value={newPolicyDesc} onChange={e => setNewPolicyDesc(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Describe the coaching rule..." />
                                            </div>
                                            <div>
                                                <label className={`block text-[10px] font-semibold ${textMuted} mb-1.5`}>Priority</label>
                                                <select value={newPolicyPriority} onChange={e => setNewPolicyPriority(e.target.value)} className={selectCls}>
                                                    <option value="low">Low</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="high">High</option>
                                                    <option value="critical">Critical</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mt-6">
                                            <button onClick={() => setShowAddPolicy(false)} className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold ${t('text-slate-400 bg-white/5 hover:bg-white/10', 'text-gray-500 bg-gray-100 hover:bg-gray-200')} transition-all`}>Cancel</button>
                                            <button onClick={addPolicy} className="flex-1 py-2.5 rounded-lg text-[12px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-all shadow-lg shadow-indigo-500/25">Add Policy</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>}

                        {/* ═══════════ KNOWLEDGE BASE ═══════════ */}
                        {activeTab === 'documents' && <>
                            {/* Upload Zone */}
                            <div
                                className={`rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${dragOver
                                    ? 'border-indigo-500/50 bg-indigo-500/5'
                                    : `${t('border-white/10', 'border-gray-300')} ${bgCard} ${t('hover:border-indigo-500/30', 'hover:border-indigo-400')}`
                                    }`}
                                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.csv,.json,.md" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                                    {uploading
                                        ? <div className={`w-5 h-5 border-2 ${t('border-indigo-900 border-t-indigo-400', 'border-indigo-200 border-t-indigo-600')} rounded-full animate-spin`} />
                                        : <Icon name="upload" className="w-6 h-6 text-indigo-500" />
                                    }
                                </div>
                                <p className={`text-[13px] font-bold ${t('text-slate-300', 'text-gray-700')}`}>{uploading ? 'Uploading...' : 'Drop files here or click to upload'}</p>
                                <p className={`text-[10px] ${textDim} mt-1`}>PDF, DOC, TXT, CSV, JSON, MD — Max 10MB</p>
                            </div>

                            {/* Documents List */}
                            <div className={`${bgCard} rounded-xl border ${borderCard} overflow-hidden transition-colors duration-300 ${t('', 'shadow-sm')}`}>
                                <div className={`px-5 py-3.5 border-b ${borderCard} flex items-center justify-between`}>
                                    <div className="flex items-center gap-2">
                                        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${textSecondary}`}>Uploaded Documents</h3>
                                        <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">{documents.length}</span>
                                    </div>
                                </div>
                                {documents.length === 0 ? (
                                    <div className="px-5 py-10 text-center">
                                        <Icon name="document" className={`w-8 h-8 ${t('text-slate-700', 'text-gray-300')} mx-auto mb-2`} />
                                        <p className={`text-[12px] font-bold ${textDim}`}>No documents uploaded yet</p>
                                        <p className={`text-[10px] ${t('text-slate-700', 'text-gray-400')} mt-1`}>Upload policies, FAQs, and training materials</p>
                                    </div>
                                ) : (
                                    <div className={`divide-y ${t('divide-white/5', 'divide-gray-100')}`}>
                                        {documents.map(doc => {
                                            const iconMap: Record<string, string> = { 'application/pdf': '📕', 'text/plain': '📝', 'text/csv': '📊', 'application/json': '📋', 'text/markdown': '📓' }
                                            return (
                                                <div key={doc.id} className={`flex items-center gap-3.5 px-5 py-3.5 ${t('hover:bg-white/[0.02]', 'hover:bg-gray-50')} transition-colors`}>
                                                    <span className="text-base">{iconMap[doc.type] || '📄'}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[12px] font-semibold ${t('text-slate-300', 'text-gray-700')} truncate`}>{doc.name}</p>
                                                        <p className={`text-[10px] ${textDim}`}>{formatSize(doc.size)} • {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                                                    </div>
                                                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 shrink-0">{doc.status}</span>
                                                    <button onClick={() => deleteDocument(doc.id)} className={`${textDim} hover:text-red-500 transition-colors p-1 shrink-0`}>
                                                        <Icon name="trash" className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </>}

                    </div>
                </div>
            </main>
        </div>
    )
}

export default AdminPanel
