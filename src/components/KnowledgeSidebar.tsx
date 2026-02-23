import React, { useState, useEffect } from 'react';

type KnowledgeSnippet = {
    text: string;
    docName: string;
    score: number;
};

interface KnowledgeSidebarProps {
    autoSnippets: KnowledgeSnippet[];
    apiUrl: string;
}

const KnowledgeSidebar: React.FC<KnowledgeSidebarProps> = ({ autoSnippets, apiUrl }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<KnowledgeSnippet[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        try {
            const res = await fetch(`${apiUrl}/api/knowledge/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery, limit: 3 })
            });
            const data = await res.json();
            if (data.results) {
                setSearchResults(data.results);
            }
        } catch (error) {
            console.error('[KnowledgeSidebar] Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
        <div className="flex flex-col h-full gap-4 md:gap-5 animate-in fade-in slide-in-from-right duration-500 overflow-hidden">
            {/* Manual Search */}
            <section className="shrink-0 px-1">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">Knowledge Search</h3>
                </div>
                <form onSubmit={handleSearch} className="relative group">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search base..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 md:py-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm"
                    />
                    <button
                        type="submit"
                        disabled={isSearching || !searchQuery.trim()}
                        className="absolute right-2 top-2 md:top-1.5 p-1.5 md:p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-colors"
                    >
                        {isSearching ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        )}
                    </button>
                </form>
            </section>

            {/* Manual Search Results */}
            {searchResults.length > 0 && (
                <section className="animate-in fade-in slide-in-from-top-2 duration-300 px-1">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-500">Results</h3>
                        <button
                            onClick={() => setSearchResults([])}
                            className="text-[9px] text-slate-400 hover:text-slate-600 font-bold"
                        >
                            CLEAR
                        </button>
                    </div>
                    <div className="space-y-3">
                        {searchResults.map((snippet, i) => (
                            <div key={`search-${i}`} className="bg-white border border-indigo-50 rounded-xl p-3 text-[11px] leading-relaxed shadow-sm hover:shadow-md transition-shadow relative group">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[8px] md:text-[9px] font-black uppercase text-indigo-400 px-1.5 py-0.5 bg-indigo-50 rounded truncate max-w-[120px]">
                                        {snippet.docName}
                                    </span>
                                    <button
                                        onClick={() => copyToClipboard(snippet.text, i + 100)}
                                        className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 shrink-0"
                                    >
                                        {copiedIndex === i + 100 ? (
                                            <><span className="text-emerald-500">✓</span> Copied</>
                                        ) : (
                                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg> Copy</>
                                        )}
                                    </button>
                                </div>
                                <p className="text-slate-700 italic">"{snippet.text}"</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Auto-suggested Snippets */}
            <section className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar px-1">
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-50 pb-1 z-10">
                    <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">Suggestions</h3>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[8px] md:text-[9px] font-black animate-pulse">
                        <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                        AUTO-RAG
                    </div>
                </div>

                {autoSnippets.length === 0 ? (
                    <div className="bg-white/50 border border-dashed border-slate-200 rounded-2xl p-6 md:p-8 text-center">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-[10px] md:text-[11px] text-slate-400 font-medium">Listening for keywords to suggest relevant knowledge...</p>
                    </div>
                ) : (
                    <div className="space-y-3 pb-4">
                        {autoSnippets.map((snippet, i) => (
                            <div key={`auto-${i}`} className="bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-100 rounded-2xl p-4 text-[11px] leading-relaxed shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/20 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />

                                <div className="flex items-center justify-between mb-2 relative z-10">
                                    <span className="text-[8px] md:text-[9px] font-black uppercase text-emerald-600 flex items-center gap-1 truncate max-w-[150px]">
                                        <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.434.29-3.48.804v10a7.969 7.969 0 013.48-.804c1.336 0 2.59.322 3.696.895 1.106-.573 2.36-.895 3.696-.895a7.969 7.969 0 013.48.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.434.29-3.48.804V4.804z" /></svg>
                                        {snippet.docName}
                                    </span>
                                    <button
                                        onClick={() => copyToClipboard(snippet.text, i)}
                                        className="opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 text-[10px] font-black text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition-opacity shrink-0 ml-2"
                                    >
                                        {copiedIndex === i ? 'COPIED!' : 'COPY'}
                                    </button>
                                    {/* Mobile-only visible button indicator */}
                                    <button
                                        onClick={() => copyToClipboard(snippet.text, i)}
                                        className="md:hidden text-[9px] font-black text-emerald-600 bg-emerald-100/50 px-2 py-1 rounded truncate ml-2"
                                    >
                                        {copiedIndex === i ? 'COPIED!' : 'COPY'}
                                    </button>
                                </div>
                                <p className="text-emerald-900 font-medium relative z-10">"{snippet.text}"</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default KnowledgeSidebar;
