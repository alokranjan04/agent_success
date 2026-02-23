import React, { useState, useEffect, useRef, useMemo } from 'react'
import { io } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || ''
const socket = io(API_URL || window.location.origin)


// --- Coaching Analysis Engine ---
type CoachingInsight = { label: string; color: 'green' | 'blue' | 'amber' | 'rose'; tip: string }
type KBArticle = { title: string; summary: string; doc: string; relevance: number }

const TOPIC_KB: Record<string, KBArticle> = {
    refund: { title: 'Refund Policy — Enterprise Tier', summary: 'Enterprise customers are eligible for immediate refunds on unauthorized charges. No approval required for amounts under $500.', doc: 'Policy Doc #RF-201', relevance: 95 },
    billing: { title: 'Billing Dispute Resolution', summary: 'Follow the 3-step dispute process: Acknowledge → Investigate → Resolve. Always offer proactive billing alerts.', doc: 'SOP #BD-102', relevance: 90 },
    upgrade: { title: 'Auto-Upgrade Prevention', summary: 'Navigate to Account Settings → Billing → Auto-upgrade toggle. Disable to prevent automatic tier changes.', doc: 'KB Article #4521', relevance: 88 },
    account: { title: 'Account Management Guide', summary: 'For account changes, verify identity first. Use two-factor verification for sensitive operations.', doc: 'KB Article #AM-330', relevance: 85 },
    cancel: { title: 'Cancellation & Retention', summary: 'Offer retention incentives before processing cancellations. Escalate high-value accounts ($500+/mo).', doc: 'SOP #CR-205', relevance: 92 },
    technical: { title: 'Technical Troubleshooting', summary: 'Collect browser, OS, and error details. Check system status page first before deep-diving.', doc: 'KB Article #TS-112', relevance: 80 },
    password: { title: 'Password & Security Reset', summary: 'Send password reset link via verified email. Never share temp passwords over chat.', doc: 'Security SOP #PS-001', relevance: 94 },
    shipping: { title: 'Shipping & Delivery Policy', summary: 'Standard delivery 5-7 days, Express 2-3 days. Full refund for delays over 14 days.', doc: 'Policy Doc #SD-150', relevance: 87 },
    plan: { title: 'Subscription Plan Details', summary: 'Compare plan features and pricing. Upgrades are prorated; downgrades take effect next billing cycle.', doc: 'KB Article #SP-220', relevance: 86 },
    general: { title: 'Customer Service Best Practices', summary: 'Always greet by name, acknowledge concerns, provide clear timelines, and confirm resolution.', doc: 'Training Doc #CS-001', relevance: 70 },
}

const EMPATHY_WORDS = ['understand', 'sorry', 'appreciate', 'frustrat', 'concern', 'help', 'resolve', 'right away', 'immediately', 'happy to', 'absolutely', 'certainly', 'of course', 'apologi']
const NEGATIVE_WORDS = ['angry', 'upset', 'furious', 'terrible', 'worst', 'hate', 'ridiculous', 'unacceptable', 'lawsuit', 'report', 'supervisor', 'manager', 'escalat', 'cancel', 'never again', 'disgusting', 'scam']
const POSITIVE_WORDS = ['thank', 'great', 'perfect', 'wonderful', 'awesome', 'helpful', 'excellent', 'good', 'appreciate', 'nice', 'love']

function analyzeConversation(messages: { role: string; text: string }[]) {
    const allText = messages.map(m => m.text.toLowerCase()).join(' ')
    const agentTexts = messages.filter(m => m.role === 'agent').map(m => m.text.toLowerCase())
    const customerTexts = messages.filter(m => m.role === 'customer').map(m => m.text.toLowerCase())
    const lastCustomerMsg = customerTexts[customerTexts.length - 1] || ''
    const lastAgentMsg = agentTexts[agentTexts.length - 1] || ''

    // --- Detect relevant KB articles ---
    const detectedTopics: string[] = []
    const topicKeywords: Record<string, string[]> = {
        refund: ['refund', 'money back', 'reimburse', 'credit', 'charge back'],
        billing: ['bill', 'charge', 'invoice', 'payment', 'overcharg'],
        upgrade: ['upgrade', 'auto-upgrade', 'tier change', 'plan change'],
        account: ['account', 'profile', 'settings', 'login'],
        cancel: ['cancel', 'close account', 'terminate', 'end service', 'stop subscription'],
        technical: ['error', 'bug', 'crash', 'not working', 'broken', 'issue', 'problem', 'glitch'],
        password: ['password', 'reset', 'locked out', 'can\'t login', 'security'],
        shipping: ['shipping', 'delivery', 'package', 'tracking', 'order status'],
        plan: ['plan', 'subscription', 'pricing', 'feature', 'enterprise', 'gold', 'premium'],
    }
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(kw => allText.includes(kw))) detectedTopics.push(topic)
    }
    if (detectedTopics.length === 0) detectedTopics.push('general')
    const kbArticles = detectedTopics.slice(0, 3).map(t => TOPIC_KB[t])

    // --- Empathy score ---
    const agentAllText = agentTexts.join(' ')
    const empathyHits = EMPATHY_WORDS.filter(w => agentAllText.includes(w)).length
    const empathyScore = messages.length === 0 ? 0 : Math.min(100, Math.round((empathyHits / Math.max(1, agentTexts.length)) * 50 + 40))

    // --- Sentiment analysis (customer) ---
    const customerAllText = customerTexts.join(' ')
    const negHits = NEGATIVE_WORDS.filter(w => customerAllText.includes(w)).length
    const posHits = POSITIVE_WORDS.filter(w => customerAllText.includes(w)).length
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (posHits > negHits + 1) sentiment = 'positive'
    else if (negHits > posHits) sentiment = 'negative'

    // --- Coaching insights ---
    const insights: CoachingInsight[] = []
    if (empathyHits > 0) {
        insights.push({ label: 'Empathy', color: 'green', tip: empathyScore > 70 ? 'Great empathy shown — keep acknowledging the customer\'s concerns.' : 'Try using more empathetic language to build rapport.' })
    }
    if (lastCustomerMsg && NEGATIVE_WORDS.some(w => lastCustomerMsg.includes(w))) {
        insights.push({ label: 'De-escalation Needed', color: 'rose', tip: 'Customer seems frustrated. Use calming language and offer a concrete solution.' })
    }
    if (lastCustomerMsg && lastCustomerMsg.includes('?')) {
        insights.push({ label: 'Question Detected', color: 'amber', tip: 'Customer asked a question — provide a clear, direct answer.' })
    }
    if (agentTexts.length > 0 && !EMPATHY_WORDS.some(w => lastAgentMsg.includes(w))) {
        insights.push({ label: 'Tone Check', color: 'amber', tip: 'Consider adding empathetic acknowledgment in your next response.' })
    }
    if (insights.length === 0 && messages.length > 0) {
        insights.push({ label: 'On Track', color: 'green', tip: 'Conversation is flowing well. Continue the current approach.' })
    }

    // --- Next Best Action ---
    let nextAction = 'Greet the customer and ask how you can help today.'
    if (sentiment === 'negative') nextAction = 'Acknowledge frustration first, then propose a concrete resolution with a timeline.'
    else if (detectedTopics.includes('refund')) nextAction = 'Verify the charge details and initiate the refund process.'
    else if (detectedTopics.includes('cancel')) nextAction = 'Understand the reason for cancellation and offer retention incentives.'
    else if (detectedTopics.includes('billing')) nextAction = 'Pull up the customer\'s billing history and identify the discrepancy.'
    else if (detectedTopics.includes('technical')) nextAction = 'Collect error details and check the system status page.'
    else if (detectedTopics.includes('password')) nextAction = 'Verify identity and send a secure password reset link.'
    else if (posHits > 1) nextAction = 'Customer is satisfied — ask if there\'s anything else you can help with.'
    else if (messages.length > 0) nextAction = 'Continue addressing the customer\'s concern with a solution.'

    // --- Smart Reply Templates ---
    const smartReplies: string[] = []
    const lastRole = messages.length > 0 ? messages[messages.length - 1].role : ''

    if (messages.length === 0) {
        smartReplies.push(
            'Hello! Thank you for reaching out. How can I assist you today?',
            'Hi there! Welcome to support. I\'m here to help — what can I do for you?',
            'Good day! I\'m your support agent. Please let me know what I can help you with.'
        )
    } else if (lastRole === 'customer') {
        const fullCustomerText = customerTexts.join(' ');
        const hasEmail = /[\w-\.]+@([\w-]+\.)+[\w-]{2,4}/.test(fullCustomerText);
        const hasPhone = /\d{7,}/.test(fullCustomerText);
        const hasName = fullCustomerText.includes('my name is') || fullCustomerText.includes('name is') || fullCustomerText.includes('this is');
        const contactInfoProvided = hasEmail || hasPhone || hasName;

        if (!contactInfoProvided) {
            smartReplies.push(
                "To assist you better, could you please share your full Name, Phone number, and Email address? This helps me pull up your account quickly.",
                "I'd be happy to help! Before I proceed, may I have your Name, Email, and Phone number so I can verify your account?",
                "Sure, I can help with that! Could you please provide your Name, Phone, and Email for verification? That way I can access your account details right away."
            );
        }

        if (contactInfoProvided) {
            smartReplies.push(
                "Thank you for providing those details. Please wait a moment while I verify your information and pull up your account.",
                "I've received your details. One moment please while I check your account status...",
                "Thank you. Let me check your details right away. I'll be with you in just a second."
            );
        }

        if (sentiment === 'negative') {
            smartReplies.push(
                "I completely understand your frustration and I'm truly sorry for this experience. To help you as quickly as possible, could you please provide your full Name, Email, and Phone number? Also, please share your Booking ID so I can look into this immediately.",
                "I'm really sorry you're dealing with this. That's absolutely not acceptable, and I want to make it right. Before we proceed with a resolution, could you please verify your Name, Email, and Phone? If you have a Booking ID handy, that would also be very helpful to pull up your account.",
                "I hear you, and I understand how upsetting this must be. I've prioritized your case. To get started, please share your full Name, Email, Phone number, and Booking ID so I can investigate this for you right away."
            )
        }
        if (detectedTopics.includes('refund')) {
            smartReplies.push(
                'I can see the charge on your account. I\'m initiating a full refund right now — you should see it reflected within 3-5 business days.',
                'Let me process that refund for you immediately. I\'ll also add a note to your account to prevent this from happening again.',
                'I\'ve reviewed the charge and you\'re absolutely right — this was unauthorized. I\'m reversing it now and will email you a confirmation.'
            )
        }
        if (detectedTopics.includes('billing')) {
            smartReplies.push(
                'Let me pull up your billing details right away. I can see the discrepancy and I\'ll get this corrected for you.',
                'I\'ve reviewed your recent invoices and can see where the issue is. Let me walk you through what happened and how we\'ll fix it.',
                'I understand billing issues are stressful. I\'m looking at your account now and I\'ll have this sorted out in just a moment.'
            )
        }
        if (detectedTopics.includes('cancel')) {
            smartReplies.push(
                'I understand you\'re considering cancellation. Before we proceed, I\'d love to understand what\'s not working for you — maybe we can find a better solution.',
                'I\'m sorry to hear that. As a valued customer, I can offer you a 30% discount for the next 3 months. Would that help?',
                'I completely understand. Let me process this for you. Before I do, would you like me to check if there\'s a plan that better fits your needs?'
            )
        }
        if (detectedTopics.includes('technical')) {
            smartReplies.push(
                'I\'m sorry you\'re experiencing this issue. Could you share the exact error message you\'re seeing? That will help me diagnose it faster.',
                'Let me check our system status right away. In the meantime, could you try clearing your browser cache and refreshing the page?',
                'I understand how frustrating technical issues can be. I\'ve escalated this to our engineering team and they\'re looking into it now.'
            )
        }
        if (detectedTopics.includes('password')) {
            smartReplies.push(
                'No problem! I\'ve sent a password reset link to your registered email address. Please check your inbox and spam folder.',
                'For security purposes, I\'ll need to verify your identity first. Could you confirm the email address associated with your account?',
                'I\'ve unlocked your account and sent a reset link. The link will expire in 24 hours for your security.'
            )
        }
        if (detectedTopics.includes('shipping')) {
            smartReplies.push(
                'Let me look up the tracking information for your order right away. One moment please.',
                'I can see your package is currently in transit. Based on the tracking, it should arrive by tomorrow. I\'ll also send you the tracking link.',
                'I apologize for the delay. I\'m arranging express re-shipment at no extra charge, and you\'ll receive a tracking number within the hour.'
            )
        }
        if (smartReplies.length < 3 && sentiment !== 'negative') {
            smartReplies.push(
                'Thank you for sharing that. Let me look into this for you right away.',
                'I appreciate you bringing this to my attention. I\'m on it and will have an update for you shortly.',
                'Absolutely, I can help with that. Let me check the details and get back to you in just a moment.'
            )
        }
        if (sentiment === 'positive') {
            smartReplies.push(
                'I\'m glad I could help! Is there anything else I can assist you with today?',
                'Thank you for your patience! If you need anything in the future, don\'t hesitate to reach out.'
            )
        }
    } else {
        smartReplies.push(
            'Is there anything else I can help you with today?',
            'I want to make sure everything is resolved. Do you have any other questions?',
            'Before we wrap up, would you like me to set up any alerts to prevent this issue in the future?'
        )
    }

    const uniqueReplies = [...new Set(smartReplies)].slice(0, 4)

    let scriptScore = 50
    if (agentTexts.length > 0) {
        let checks = 0
        if (agentAllText.match(/hello|hi|hey|good|welcome|greet/)) checks += 20
        if (EMPATHY_WORDS.some(w => agentAllText.includes(w))) checks += 25
        if (agentAllText.match(/let me|i will|i can|i\'ll/)) checks += 20
        if (agentAllText.match(/anything else|further|help.*more/)) checks += 15
        if (agentAllText.length > 50) checks += 10
        scriptScore = Math.min(100, 10 + checks)
    }
    if (messages.length === 0) scriptScore = 0

    let escalationProb = 5
    escalationProb += negHits * 12
    if (customerAllText.includes('supervisor') || customerAllText.includes('manager')) escalationProb += 30
    if (customerAllText.includes('cancel') || customerAllText.includes('lawsuit')) escalationProb += 25
    escalationProb = Math.min(95, Math.max(5, escalationProb - posHits * 5))
    if (messages.length === 0) escalationProb = 0

    return { kbArticles, insights, nextAction, sentiment, empathyScore, scriptScore, escalationProb, smartReplies: uniqueReplies }
}

const App: React.FC = () => {
    const [conversations, setConversations] = useState<any[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<{ id?: string, role: string, text: string, time: string }[]>([]);
    const [timer, setTimer] = useState("00:00");
    const [agentInput, setAgentInput] = useState('');
    const [customerTyping, setCustomerTyping] = useState(false);
    const [companyName, setCompanyName] = useState('AgentOS');
    const [summaryText, setSummaryText] = useState<string | null>(null);
    const [showSummary, setShowSummary] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    const [showMobileCoaching, setShowMobileCoaching] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef(0);

    useEffect(() => {
        socket.emit('register', { role: 'agent' });

        socket.on('update_conversations', (updatedConvs: any[]) => {
            setConversations(updatedConvs);
        });

        socket.on('chat_history', (history) => {
            setMessages(history);
        });

        socket.on('new_message', (msg) => {
            if (activeConvId && msg.conversationId === activeConvId) {
                setMessages(prev => [...prev, msg]);
                setCustomerTyping(false);
            }
        });

        socket.on('user_typing', (data) => {
            if (data.role === 'customer' && data.conversationId === activeConvId) setCustomerTyping(true);
        });

        socket.on('user_stop_typing', (data) => {
            if (data.role === 'customer' && data.conversationId === activeConvId) setCustomerTyping(false);
        });

        socket.on('conversation_ended', ({ summary, conversationId }) => {
            if (conversationId === activeConvId) {
                if (summary) {
                    setSummaryText(summary);
                    setShowSummary(true);
                }
                setActiveConvId(null);
                setMessages([]);
            }
        });

        fetch(`${API_URL}/api/admin/config`)
            .then(r => r.json())
            .then(c => { if (c.companyName) setCompanyName(c.companyName); })
            .catch(() => { });

        socket.on('config_updated', (config: any) => {
            if (config.companyName) setCompanyName(config.companyName);
        });

        const interval = setInterval(() => {
            timerRef.current += 1;
            const mins = String(Math.floor(timerRef.current / 60)).padStart(2, '0');
            const secs = String(timerRef.current % 60).padStart(2, '0');
            setTimer(`${mins}:${secs}`);
        }, 1000);

        return () => {
            clearInterval(interval);
            socket.off('update_conversations');
            socket.off('chat_history');
            socket.off('new_message');
            socket.off('user_typing');
            socket.off('user_stop_typing');
            socket.off('config_updated');
            socket.off('conversation_ended');
        };
    }, [activeConvId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, customerTyping]);

    const handleSelectConversation = (id: string) => {
        setActiveConvId(id);
        setMessages([]);
        socket.emit('join_conversation', id);
        setShowMobileSidebar(false);
    };

    const handleSendAgentMessage = () => {
        if (!agentInput.trim() || !activeConvId) return;
        socket.emit('send_message', { conversationId: activeConvId, text: agentInput, role: 'agent' });
        setAgentInput('');
    };

    const handlePlayTTS = async (text: string, index: number) => {
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await response.json();
            if (data.audioContent) {
                const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
                audio.play();
            }
        } catch (error) { console.error('Error playing TTS:', error); }
    };

    const coaching = useMemo(() => analyzeConversation(messages), [messages]);

    const handleClearChat = async () => {
        if (!activeConvId || !confirm('Clear all chat messages for this conversation?')) return;
        try {
            await fetch(`${API_URL}/api/admin/chat-history`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: activeConvId })
            });
            setMessages([]);
        } catch (e) { console.error('Failed to clear chat:', e); }
    };

    const handleGenerateSummary = async () => {
        if (!activeConvId) return;
        setSummaryLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/generate-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: activeConvId })
            });
            const data = await res.json();
            if (data.success) {
                setSummaryText(data.summary);
                setShowSummary(true);
            } else { alert(data.error || 'Failed to generate summary'); }
        } catch (e) { alert('Failed to generate summary'); }
        setSummaryLoading(false);
    };

    const handleEndConversation = async () => {
        if (!activeConvId || !confirm('End this conversation? A summary will be generated and chat will be closed.')) return;
        setSummaryLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/end-conversation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: activeConvId })
            });
            const data = await res.json();
            if (data.success) {
                setMessages([]);
                setActiveConvId(null);
                if (data.summary) {
                    setSummaryText(data.summary);
                    setShowSummary(true);
                }
            } else { alert(data.error || 'Failed to end conversation'); }
        } catch (e) { alert('Failed to end conversation'); }
        setSummaryLoading(false);
    };

    return (
        <div className="flex flex-col h-screen h-[100dvh] w-full bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 overflow-hidden">
            <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 z-30 shadow-sm">
                <div className="flex items-center gap-3 md:gap-6">
                    <button
                        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                        className="p-1.5 md:hidden bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 2V3z" /></svg>
                        </div>
                        <span className="font-bold text-base md:text-lg tracking-tight text-slate-800 hidden xs:inline">{companyName}</span>
                    </div>
                    <div className="bg-blue-50 text-blue-600 px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold ring-1 ring-blue-100 flex items-center gap-1.5 transition-all">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                        {conversations.length} <span className="hidden sm:inline">Active</span> {conversations.length === 1 ? 'Session' : 'Sessions'}
                    </div>
                </div>
                <div className="flex items-center gap-3 md:gap-8">
                    <div className="hidden sm:flex items-center gap-4 text-slate-500 font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>{timer}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-4 border-l border-slate-200 pl-3 md:pl-8">
                        <a href="/voice" target="_blank" className="flex items-center gap-1 text-[10px] md:text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                            <span className="hidden xs:inline">Voice</span>
                        </a>
                        <a href="/customer" target="_blank" className="hidden sm:inline text-[10px] md:text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">Customer View</a>
                        <button onClick={() => setShowMobileCoaching(!showMobileCoaching)} className="lg:hidden p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </button>
                        <a href="/admin" target="_blank" className="hidden sm:inline text-[10px] md:text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">Admin</a>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden relative">
                <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-50 border-r border-slate-200 flex flex-col transition-transform duration-300 transform md:relative md:translate-x-0 ${showMobileSidebar ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
                    <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Active Chats</h2>
                        <button onClick={() => setShowMobileSidebar(false)} className="md:hidden text-slate-400 p-1"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" /></svg></button>
                    </div>
                    <div className="flex-1 overflow-y-auto py-2">
                        {conversations.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-wider">No active chats</div>
                        ) : (
                            conversations.map(conv => (
                                <div key={conv.id} onClick={() => handleSelectConversation(conv.id)} className={`mx-2 mb-1 p-3 rounded-xl cursor-pointer transition-all border ${activeConvId === conv.id ? 'bg-white border-blue-200 shadow-md ring-1 ring-blue-50' : 'bg-transparent border-transparent hover:bg-slate-200/50'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm ${activeConvId === conv.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>{conv.customerInfo?.name?.charAt(0) || 'C'}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-[12px] font-bold truncate ${activeConvId === conv.id ? 'text-slate-800' : 'text-slate-500'}`}>{conv.customerInfo?.name || 'Customer'}</p>
                                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].text : 'New chat'}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </aside>

                {showMobileSidebar && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden" onClick={() => setShowMobileSidebar(false)} />}

                <div className="flex-1 flex overflow-hidden">
                    {activeConvId ? (
                        <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
                            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-6 flex flex-col items-center custom-scrollbar">
                                <div className="w-full max-w-2xl space-y-4 md:space-y-6">
                                    {messages.map((m, i) => (
                                        <div key={i} className="flex gap-4 group/msg">
                                            <span className="shrink-0 w-8 text-[10px] font-bold text-slate-300 mt-1">{m.time}</span>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1.5 px-1">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${m.role === 'agent' ? 'text-blue-500' : 'text-slate-400'}`}>{m.role === 'agent' ? 'Agent' : 'Customer'}</span>
                                                    <button onClick={() => handlePlayTTS(m.text, i)} className="text-slate-200 hover:text-blue-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" /></svg></button>
                                                </div>
                                                <div className={`p-3 md:p-4 rounded-2xl text-[12px] md:text-[13px] leading-relaxed ${m.role === 'agent' ? 'bg-blue-50 text-slate-800 rounded-tr-sm' : 'bg-slate-100 text-slate-700 rounded-tl-sm'}`}>{m.text}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {customerTyping && (
                                        <div className="flex gap-4">
                                            <span className="shrink-0 w-8"></span>
                                            <div className="bg-slate-100 rounded-2xl p-4 w-16 flex gap-1 items-center justify-center">
                                                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                            </div>

                            <div className="p-4 md:p-6 border-t border-slate-200 bg-white z-10">
                                <div className="w-full max-w-2xl mx-auto space-y-3 md:space-y-4">
                                    <div className="flex items-center gap-2 md:gap-3">
                                        <input className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 md:py-3 px-3 md:px-4 text-[13px] md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all font-medium" placeholder="Type your reply..." value={agentInput} onChange={e => setAgentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendAgentMessage()} />
                                        <button onClick={handleSendAgentMessage} className="px-4 md:px-6 py-2.5 md:py-3 bg-blue-600 rounded-xl text-white text-[13px] md:text-sm font-bold hover:bg-blue-700 transition-all shadow-md shrink-0">Send</button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 md:gap-3 pt-2 md:pt-3 border-t border-slate-100">
                                        <button onClick={handleClearChat} className="text-[9px] md:text-[10px] font-bold text-slate-500 hover:text-red-500 transition-colors uppercase tracking-wider">Clear</button>
                                        <button onClick={handleGenerateSummary} disabled={summaryLoading} className="text-[9px] md:text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-wider">Summary</button>
                                        <button onClick={handleEndConversation} disabled={summaryLoading} className="text-[9px] md:text-[10px] font-bold text-rose-600 hover:text-rose-700 ml-auto transition-colors uppercase tracking-wider">End Session</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center bg-white text-center p-12">
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                            </div>
                            <h2 className="text-xl font-bold text-slate-800">Select a conversation</h2>
                            <p className="text-slate-400 mt-2 text-sm max-w-xs">Pick a customer from the left sidebar to start chatting and view real-time coaching insights.</p>
                        </div>
                    )}

                    <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 transition-opacity xl:hidden ${showMobileCoaching ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowMobileCoaching(false)}>
                        <aside className={`absolute right-0 top-0 h-full w-[280px] xs:w-[320px] bg-slate-50 shadow-2xl transition-transform duration-300 flex flex-col p-5 gap-6 ${showMobileCoaching ? 'translate-x-0' : 'translate-x-full'}`} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between shrink-0">
                                <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Live Coaching</h2>
                                <button onClick={() => setShowMobileCoaching(false)} className="p-1 px-2 bg-slate-200 rounded-lg text-slate-500 font-bold text-xs uppercase">Close</button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-8 pr-1 custom-scrollbar">
                                <aside className="w-full space-y-8">
                                    <section>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Smart Replies</h3>
                                        <div className="space-y-2">
                                            {coaching.smartReplies.map((reply: string, idx: number) => (
                                                <button key={idx} onClick={() => { setAgentInput(reply); setShowMobileCoaching(false); }} className="w-full text-left bg-white hover:bg-blue-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-medium transition-all shadow-sm">{reply}</button>
                                            ))}
                                            {activeConvId && coaching.smartReplies.length === 0 && <p className="text-[10px] text-slate-400 italic">Listening for topics...</p>}
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Sentiment</h3>
                                        <div className={`p-4 rounded-xl border flex items-center gap-3 ${coaching.sentiment === 'negative' ? 'bg-rose-50 border-rose-100 text-rose-600' : coaching.sentiment === 'positive' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-white border-slate-200 text-slate-600'}`}>
                                            <span className="text-xl">{coaching.sentiment === 'positive' ? '😊' : coaching.sentiment === 'negative' ? '😤' : '😐'}</span>
                                            <span className="text-xs font-bold uppercase">{coaching.sentiment}</span>
                                        </div>
                                    </section>
                                    <section>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Metrics</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1"><span>Empathy</span><span>{coaching.empathyScore}%</span></div>
                                                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${coaching.empathyScore}%` }}></div></div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1"><span>Script</span><span>{coaching.scriptScore}%</span></div>
                                                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${coaching.scriptScore}%` }}></div></div>
                                            </div>
                                        </div>
                                    </section>
                                </aside>
                            </div>
                        </aside>
                    </div>

                    <aside className="w-[340px] bg-slate-50 border-l border-slate-200 overflow-y-auto px-5 py-6 shrink-0 space-y-6 hidden lg:block">
                        <section>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Smart Replies</h3>
                            <div className="space-y-2">
                                {coaching.smartReplies.map((reply: string, idx: number) => (
                                    <button key={idx} onClick={() => setAgentInput(reply)} className="w-full text-left bg-white hover:bg-blue-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-medium transition-all shadow-sm">{reply}</button>
                                ))}
                                {activeConvId && coaching.smartReplies.length === 0 && <p className="text-[10px] text-slate-400 italic">Listening for topics...</p>}
                                {!activeConvId && <p className="text-[10px] text-slate-400 italic">Select a chat to see suggestions</p>}
                            </div>
                        </section>
                        <section>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Sentiment</h3>
                            <div className={`p-4 rounded-xl border flex items-center gap-3 ${coaching.sentiment === 'negative' ? 'bg-rose-50 border-rose-100 text-rose-600' : coaching.sentiment === 'positive' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-white border-slate-200 text-slate-600'}`}>
                                <span className="text-xl">{coaching.sentiment === 'positive' ? '😊' : coaching.sentiment === 'negative' ? '😤' : '😐'}</span>
                                <span className="text-xs font-bold uppercase">{coaching.sentiment}</span>
                            </div>
                        </section>
                        <section>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Metrics</h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1"><span>Empathy</span><span>{coaching.empathyScore}%</span></div>
                                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${coaching.empathyScore}%` }}></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1"><span>Script</span><span>{coaching.scriptScore}%</span></div>
                                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${coaching.scriptScore}%` }}></div></div>
                                </div>
                            </div>
                        </section>
                    </aside>
                </div>
            </main>

            {showSummary && summaryText && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Chat Summary</h3>
                            <button onClick={() => setShowSummary(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{summaryText}</div>
                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => { navigator.clipboard.writeText(summaryText); }} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold">Copy</button>
                            <button onClick={() => setShowSummary(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
