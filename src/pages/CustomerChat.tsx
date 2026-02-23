import React, { useState, useRef, useEffect } from 'react'
import { io } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || ''
const socket = io(API_URL || window.location.origin)


const CustomerChat: React.FC = () => {
    const [messages, setMessages] = useState<{ id?: string; role: string; text: string; time: string }[]>([])
    const [input, setInput] = useState('')
    const [agentTyping, setAgentTyping] = useState(false)
    const [agentOnline, setAgentOnline] = useState(false)
    const [companyName, setCompanyName] = useState('AgentOS')
    const chatEndRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        let conversationId = sessionStorage.getItem('chat_conversation_id');

        socket.emit('register', {
            role: 'customer',
            conversationId,
            customerInfo: { name: 'Customer #' + Math.floor(Math.random() * 1000) }
        })

        socket.on('session_started', (data) => {
            sessionStorage.setItem('chat_conversation_id', data.conversationId);
        });

        socket.on('chat_history', (history) => {
            setMessages(history)
        })

        socket.on('new_message', (msg) => {
            setMessages(prev => [...prev, msg])
            setAgentTyping(false)
        })

        socket.on('user_typing', (data) => {
            if (data.role === 'agent') setAgentTyping(true)
        })

        socket.on('user_stop_typing', (data) => {
            if (data.role === 'agent') setAgentTyping(false)
        })

        socket.on('user_status', (data) => {
            if (data.role === 'agent') setAgentOnline(data.status === 'online')
        })

        socket.on('conversation_ended', ({ summary }) => {
            setMessages(prev => [...prev, { role: 'system', text: 'This conversation has ended.', time: new Date().toLocaleTimeString() }]);
            sessionStorage.removeItem('chat_conversation_id');
        });

        // Fetch admin config for company name
        fetch('${API_URL}/api/admin/config')
            .then(r => r.json())
            .then(c => { if (c.companyName) setCompanyName(c.companyName) })
            .catch(() => { })

        // Listen for live config updates
        socket.on('config_updated', (config: any) => {
            if (config.companyName) setCompanyName(config.companyName)
        })

        return () => {
            socket.off('chat_history')
            socket.off('new_message')
            socket.off('user_typing')
            socket.off('user_stop_typing')
            socket.off('user_status')
            socket.off('config_updated')
            socket.off('session_started')
            socket.off('conversation_ended')
        }
    }, [])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, agentTyping])

    const handleInputChange = (val: string) => {
        setInput(val)
        const conversationId = sessionStorage.getItem('chat_conversation_id');
        socket.emit('typing', { role: 'customer', conversationId })
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop_typing', { role: 'customer', conversationId })
        }, 1000)
    }

    const handleSend = () => {
        if (!input.trim()) return
        const conversationId = sessionStorage.getItem('chat_conversation_id');
        socket.emit('send_message', { role: 'customer', text: input, conversationId })
        setInput('')
        socket.emit('stop_typing', { role: 'customer', conversationId })
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen h-[100dvh] bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 font-sans p-0 sm:p-4 overflow-hidden">
            {/* Chat Window */}
            <div className="w-full max-w-lg flex flex-col bg-white sm:rounded-3xl shadow-2xl shadow-blue-200/40 overflow-hidden border-x border-b border-slate-200/60 h-full max-h-[900px]">
                {/* Header */}
                <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 md:px-6 py-3 md:py-4 shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22rgba(255%2C255%2C255%2C0.05)%22%2F%3E%3C%2Fsvg%3E')] opacity-50"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h1 className="font-bold text-xs md:text-sm tracking-tight truncate">Support Chat</h1>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${agentOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                                    <span className="text-[9px] md:text-[10px] text-blue-100 font-medium truncate">{agentOnline ? 'Agent is online' : 'Connecting...'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] md:text-[10px] bg-white/15 px-2.5 py-1 rounded-full font-bold tracking-wide backdrop-blur-sm uppercase">Secure</span>
                        </div>
                    </div>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 md:py-6 space-y-4 md:space-y-5 bg-gradient-to-b from-white to-slate-50/50 custom-scrollbar">
                    {/* Empty state */}
                    {messages.length === 0 && !agentTyping && (
                        <div className="flex flex-col items-center justify-center h-full text-center px-4">
                            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 md:w-8 md:h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest">Chat Open</p>
                            <p className="text-[10px] md:text-xs text-slate-300 mt-1 uppercase tracking-tight">An agent will be with you shortly</p>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={m.id || i} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                            {m.role === 'agent' && (
                                <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-200/50 mb-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 md:w-3.5 h-3 md:h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                </div>
                            )}
                            <div className={`flex flex-col gap-1 ${m.role === 'customer' ? 'max-w-[85%] md:max-w-[75%]' : 'max-w-[80%] md:max-w-[70%]'}`}>
                                <div
                                    className={`px-3 md:px-4 py-2 md:py-2.5 text-[12px] md:text-[13px] leading-relaxed ${m.role === 'customer'
                                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-sm shadow-md shadow-blue-900/10'
                                        : 'bg-white text-slate-700 rounded-2xl rounded-bl-sm shadow-sm ring-1 ring-slate-100'
                                        }`}
                                >
                                    {m.text}
                                </div>
                                <span className={`text-[8px] md:text-[9px] font-bold text-slate-300 ${m.role === 'customer' ? 'text-right pr-1' : 'pl-1'}`}>
                                    {m.time}
                                </span>
                            </div>
                        </div>
                    ))}

                    {/* Typing Indicator */}
                    {agentTyping && (
                        <div className="flex items-end gap-2">
                            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </div>
                            <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm ring-1 ring-slate-100">
                                <div className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                                    <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                                    <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>

                {/* Quick Actions */}
                <div className="px-4 py-2 bg-white border-t border-slate-50 shrink-0 overflow-x-auto">
                    <div className="flex gap-2 min-w-max">
                        <button
                            onClick={() => handleInputChange('Check refund status')}
                            className="shrink-0 text-[10px] font-bold text-blue-600 bg-blue-50/50 hover:bg-blue-100 px-3 py-1.5 rounded-full border border-blue-100/50 transition-colors"
                        >
                            Refund Status
                        </button>
                        <button
                            onClick={() => handleInputChange('Speak with supervisor')}
                            className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
                        >
                            Supervisor
                        </button>
                    </div>
                </div>

                {/* Input Area */}
                <footer className="px-3 md:px-4 py-3 md:py-4 bg-white border-t border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                        <input
                            className="flex-1 bg-slate-100 border-0 rounded-xl py-2.5 px-3 md:px-4 text-[13px] md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-slate-400 font-medium"
                            placeholder="Type message..."
                            value={input}
                            onChange={e => handleInputChange(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim()}
                            className="p-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white hover:shadow-lg hover:shadow-blue-200/50 transition-all disabled:opacity-30 disabled:shadow-none shrink-0 active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </div>
                </footer>

                {/* Footer */}
                <div className="text-center py-1.5 bg-slate-50 border-t border-slate-100">
                    <span className="text-[8px] md:text-[9px] text-slate-300 font-black uppercase tracking-widest">{companyName} Secure Messenger</span>
                </div>
            </div>
        </div>
    )
}

export default CustomerChat

