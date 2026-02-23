import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dialogflow from '@google-cloud/dialogflow-cx';
import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import KnowledgeService from './services/knowledgeService.js';

const { ConversationsClient } = dialogflow;

dotenv.config();

// --- Firebase Admin SDK ---
const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (firebaseServiceAccount) {
    try {
        const serviceAccount = JSON.parse(firebaseServiceAccount);
        // Fix for private key newlines in .env
        if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log('Firebase Admin SDK initialized.');
    } catch (err) {
        console.error('Failed to initialize Firebase Admin SDK:', err.message);
        // Initialization fallback (if any)
    }
} else {
    console.warn('WARNING: FIREBASE_SERVICE_ACCOUNT_KEY not set. Config will not persist.');
}

const firestore = admin.apps.length ? admin.firestore() : null;
const CONFIG_COLLECTION = 'admin_configuration';
const CONFIG_DOC = 'agent_settings';

// Load config from Firestore
async function loadConfigFromFirestore() {
    if (!firestore) return null;
    try {
        const snap = await firestore.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
        if (snap.exists) {
            console.log('[Firebase] Config loaded from Firestore');
            return snap.data();
        }
    } catch (e) {
        console.warn('[Firebase] Could not load config:', e.message);
    }
    return null;
}

// Save config to Firestore
async function saveConfigToFirestore(config) {
    if (!firestore) return;
    try {
        await firestore.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(config);
        console.log('[Firebase] Config saved to Firestore');
    } catch (e) {
        console.warn('[Firebase] Could not save config:', e.message);
    }
}

const app = express();
const httpServer = createServer(app);

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for dev flexibility, enable and configure for strict production
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', limiter);

const allowedOrigins = [
    'https://agent-success-utsa5eayma-uc.a.run.app',
    'http://localhost:3005',
    'http://localhost:5005'
];

const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '1mb' })); // Limit body size

// Simple request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

const PORT = process.env.PORT || 5005;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

// Gemini AI setup
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let geminiModel = null;
if (GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('Gemini AI initialized.');
} else {
    console.warn('WARNING: GEMINI_API_KEY not set. Summary generation will be unavailable.');
}

// Knowledge Service
const knowledgeService = new KnowledgeService(GEMINI_API_KEY);

// TTS Client setup
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let ttsClient = null;

if (credentialsPath && fs.existsSync(credentialsPath)) {
    try {
        ttsClient = new textToSpeech.TextToSpeechClient();
        console.log('TTS Client initialized with credentials.');
    } catch (err) {
        console.error('Failed to initialize TTS Client:', err.message);
    }
} else {
    console.warn('WARNING: google-application-credentials not found. TTS will operate in mock mode.');
}

// --- Chat state ---
// conversations = { [id]: { messages: [], customerInfo: {}, status: 'waiting' | 'active' } }
let conversations = {};

// --- Voice session state ---
// voiceSessions = { [sessionId]: { entries: [], callerName: '' } }
let voiceSessions = {};

// --- Admin Configuration State (defaults, overridden by Firestore) ---
let adminConfig = {
    systemPrompt: 'You are a professional inbound customer support agent handling a customer who is calling in with an issue, complaint, or request. Follow this order: (1) Greet warmly and thank them for calling, (2) Verify their identity — collect name, phone, and email, (3) Listen actively without interrupting, (4) Acknowledge and empathize with their issue, (5) Offer a clear resolution or escalation path, (6) Confirm the resolution and thank them. Be empathetic, patient, and professional at all times.',
    companyName: 'AgentOS',
    agentName: 'Support Agent',
    welcomeMessage: 'Thank you for calling Customer Support! My name is [Agent Name]. May I please get your name to get started?',
    maxResponseTime: 120,
    autoGreeting: true,
    enableTTS: true,
    enableTypingIndicator: true,
    language: 'en-US',
    tone: 'professional',
    coachingPolicies: [
        { id: '1', name: 'Empathy First', description: 'Always acknowledge the customer\'s feelings before providing solutions.', enabled: true, priority: 'high' },
        { id: '2', name: 'Refund Policy', description: 'Enterprise customers get immediate refunds under $500 without approval. All other refunds require supervisor approval.', enabled: true, priority: 'high' },
        { id: '3', name: 'Escalation Protocol', description: 'If a customer mentions lawsuit, legal action, or asks for supervisor 3 times, automatically escalate.', enabled: true, priority: 'critical' },
        { id: '4', name: 'Security Verification', description: 'Verify customer identity with 2 security questions before any account changes.', enabled: true, priority: 'high' },
        { id: '5', name: 'Positive Closure', description: 'Always end the conversation by asking if there is anything else and thank the customer.', enabled: false, priority: 'medium' },
    ],
    documents: [],
    coachingPrompt: `You are an expert inbound call center coach. The customer has called in to report an issue or complaint. Your job is to guide the agent through resolving it professionally.

Coaching journey stages:
1. GREETING & VERIFICATION — Did the agent greet warmly and collect Name, Phone, Email?
2. ISSUE CAPTURE — Has the agent clearly understood and repeated back the customer's issue?
3. EMPATHY — Has the agent acknowledged the customer's frustration before jumping to solutions?
4. RESOLUTION — Is the agent offering a clear, actionable resolution or escalation path?
5. CLOSURE — Has the agent confirmed the resolution and asked if there is anything else?

Analyze the conversation and return ONLY valid JSON — no markdown, no explanation:
{
  "nextAction": "Short coaching label (5-8 words, action-oriented, e.g. 'Verify Identity Before Proceeding', 'Acknowledge Issue Before Solving', 'Offer Resolution Options Now', 'Confirm Fix and Close Warmly')",
  "smartReplies": [
    "Exact professional sentence the agent should say next",
    "Alternative phrasing option",
    "Empathy or resolution phrasing option"
  ],
  "sentiment": "neutral",
  "insights": [
    {
      "label": "Inbound QA coaching tag (e.g. Identity Not Verified, Empathy Gap, Issue Not Confirmed, Resolution Offered, Escalation Signal, Positive Closure)",
      "tip": "Specific actionable guidance based on the most recent message",
      "color": "green"
    }
  ],
  "escalationRisk": 10
}

Rules:
- If identity (name/email/phone) not yet collected → nextAction should be to collect it
- If customer is frustrated or repeating the same issue → escalationRisk > 60, color = rose
- If agent has not shown empathy → add 'Empathy Gap' insight, color = amber
- If customer mentions supervisor, legal, or complaint → escalationRisk > 80
- sentiment: positive | neutral | negative | frustrated
- color: green (good), blue (info), amber (needs attention), rose (urgent)
- escalationRisk: integer 0-100`,
    summaryPrompt: 'Generate a structured call summary in exactly this format — fill in each field based on the conversation:\n\n**Customer Information**\nCustomer Name: [name or "Not Collected"]\nCustomer Email: [email or "Not Collected"]\nCustomer Phone: [phone or "Not Collected"]\nCustomer Address: [address or "Not Collected"]\n\n**Call Details**\nReason: [concise description of why the customer called]\nResolution: [what was done — e.g. agent escalated, refunded, explained policy, offered alternative]\n\n**Sentiment Analysis**\nStarting Sentiment: [Neutral / Positive / Negative]\nPeak Sentiment: [emotion at the most intense point, e.g. Frustrated / Angry / Relieved]\nEnding Sentiment: [emotion at call end, e.g. Accepting / Satisfied / Neutral]\n\n**QA & CX Metrics**\nPolicy Compliance: [✅ or ❌]\nEffort Demonstrated: [✅ or ❌]\nEmpathy Demonstrated: [✅ or ❌]\nClarity & Transparency: [✅ or ❌]\nDe-escalation Techniques Used: [✅ or ❌]\nOwnership & Advocacy: [✅ or ❌]\nTone & Professionalism: [✅ or ❌]\nActive Listening Indicators: [Present / Absent]\nNext-Step Guidance Provided: [✅ or ❌]\nCustomer Effort Score (Estimated): [Low / Moderate / High]\nFirst Contact Resolution: [Yes / No / Partial]\nRetention Opportunity Created: [Yes / No]',
};

// Load saved config from Firestore on startup
(async () => {
    const saved = await loadConfigFromFirestore();
    if (saved) {
        adminConfig = { ...adminConfig, ...saved };
        console.log(`[Config] Loaded: companyName="${adminConfig.companyName}", welcomeMessage="${adminConfig.welcomeMessage}"`);
    }
})();

// File upload config
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// --- Socket.IO ---
io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Register based on role and optional conversationId
    socket.on('register', ({ role, conversationId, customerInfo }) => {
        socket.role = role;

        if (role === 'customer') {
            if (!conversationId) conversationId = `conv-${Date.now()}`;
            socket.conversationId = conversationId;
            socket.join(conversationId);

            if (!conversations[conversationId]) {
                conversations[conversationId] = {
                    id: conversationId,
                    messages: [],
                    customerInfo: customerInfo || { name: 'Anonymous' },
                    status: 'waiting',
                    startTime: new Date().toISOString()
                };
            }

            // Send history for this specific conversation
            socket.emit('chat_history', conversations[conversationId].messages);
            socket.emit('session_started', { conversationId });

            // Notify agents about new/updated conversation
            io.emit('update_conversations', Object.values(conversations));

            // Auto-greeting
            if (adminConfig.autoGreeting && adminConfig.welcomeMessage && conversations[conversationId].messages.length === 0) {
                const welcomeMsg = {
                    id: Date.now().toString(),
                    role: 'agent',
                    text: adminConfig.welcomeMessage,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                    conversationId: conversationId
                };
                conversations[conversationId].messages.push(welcomeMsg);
                io.to(conversationId).emit('new_message', welcomeMsg);
                io.emit('update_conversations', Object.values(conversations));
            }
        } else if (role === 'agent') {
            socket.join('agents');
            // Send overall list of conversations to agent
            socket.emit('update_conversations', Object.values(conversations));
        }
    });

    // Agent joins a specific conversation
    socket.on('join_conversation', (conversationId) => {
        if (socket.role === 'agent') {
            socket.join(conversationId);
            if (conversations[conversationId]) {
                conversations[conversationId].status = 'active';
                socket.emit('chat_history', conversations[conversationId].messages);
                io.emit('update_conversations', Object.values(conversations));
            }
        }
    });

    // A message is sent from either side
    socket.on('send_message', ({ conversationId, text, role }) => {
        const targetId = conversationId || socket.conversationId;
        if (!targetId || !conversations[targetId]) return;

        const msg = {
            id: Date.now().toString(),
            role: role || socket.role,
            text,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            conversationId: targetId
        };

        conversations[targetId].messages.push(msg);
        io.to(targetId).emit('new_message', msg);

        // Update agents on the list
        io.emit('update_conversations', Object.values(conversations));
    });

    // Typing indication
    socket.on('typing', ({ conversationId }) => {
        const id = conversationId || socket.conversationId;
        socket.to(id).emit('user_typing', { role: socket.role, conversationId: id });
    });

    socket.on('stop_typing', ({ conversationId }) => {
        const id = conversationId || socket.conversationId;
        socket.to(id).emit('user_stop_typing', { role: socket.role, conversationId: id });
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
        // Optional: notify others if needed
    });

    // ── Voice session events ──────────────────────────────────────
    socket.on('voice_start', ({ sessionId, callerName }) => {
        socket.join(`voice-${sessionId}`);
        voiceSessions[sessionId] = { entries: [], callerName: callerName || 'Caller' };
        console.log(`[Voice] Session started: ${sessionId} — caller: ${callerName}`);
    });

    // Customer joins an existing session
    socket.on('voice_join', ({ sessionId }) => {
        socket.join(`voice-${sessionId}`);
        const session = voiceSessions[sessionId];
        if (session) {
            socket.emit('voice_history', session.entries);
            console.log(`[Voice] Customer joined session: ${sessionId} (${session.entries.length} entries)`);
        }
    });

    socket.on('voice_transcript', ({ sessionId, entry }) => {
        if (voiceSessions[sessionId]) {
            voiceSessions[sessionId].entries.push(entry);
        }
        // Broadcast ONLY to the other participants — not back to sender (sender already added locally)
        socket.to(`voice-${sessionId}`).emit('voice_new_entry', { sessionId, entry });
    });

    socket.on('voice_end', ({ sessionId }) => {
        socket.to(`voice-${sessionId}`).emit('voice_session_ended', { sessionId });
        delete voiceSessions[sessionId];
        console.log(`[Voice] Session ended: ${sessionId}`);
    });
});

// --- REST Endpoints ---
app.post('/api/tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        if (!ttsClient) {
            console.log('Mocking TTS response (no credentials found)');
            return res.json({ audioContent: null, message: 'Mock mode: Please provide service-account.json' });
        }

        const request = {
            input: { text: text },
            voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        res.json({ audioContent: response.audioContent.toString('base64') });
    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ error: 'Failed to synthesize speech' });
    }
});

app.post('/api/conversations', async (req, res) => {
    try {
        const { customerId } = req.body;
        const conversationId = `mock-${Date.now()}`;
        res.json({
            conversationName: `projects/${PROJECT_ID}/locations/global/conversations/${conversationId}`
        });
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// --- Admin API ---

// Get full admin config
app.get('/api/admin/config', (req, res) => {
    res.json(adminConfig);
});

// Update general settings
app.put('/api/admin/config', async (req, res) => {
    const { systemPrompt, companyName, agentName, welcomeMessage, maxResponseTime, autoGreeting, enableTTS, enableTypingIndicator, language, tone, summaryPrompt, coachingPrompt } = req.body;
    adminConfig = { ...adminConfig, systemPrompt, companyName, agentName, welcomeMessage, maxResponseTime, autoGreeting, enableTTS, enableTypingIndicator, language, tone, summaryPrompt, coachingPrompt };
    io.emit('config_updated', adminConfig);
    await saveConfigToFirestore(adminConfig);
    console.log('[Admin] Config updated and saved to Firestore');
    res.json({ success: true, config: adminConfig });
});

// Coaching Policies CRUD
app.get('/api/admin/policies', (req, res) => {
    res.json(adminConfig.coachingPolicies);
});

app.post('/api/admin/policies', (req, res) => {
    const policy = { id: Date.now().toString(), ...req.body };
    adminConfig.coachingPolicies.push(policy);
    io.emit('config_updated', adminConfig);
    console.log(`[Admin] Policy added: ${policy.name}`);
    res.json({ success: true, policy });
});

app.put('/api/admin/policies/:id', (req, res) => {
    const idx = adminConfig.coachingPolicies.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Policy not found' });
    adminConfig.coachingPolicies[idx] = { ...adminConfig.coachingPolicies[idx], ...req.body };
    io.emit('config_updated', adminConfig);
    res.json({ success: true, policy: adminConfig.coachingPolicies[idx] });
});

app.delete('/api/admin/policies/:id', (req, res) => {
    adminConfig.coachingPolicies = adminConfig.coachingPolicies.filter(p => p.id !== req.params.id);
    io.emit('config_updated', adminConfig);
    res.json({ success: true });
});

// Document upload
app.post('/api/admin/documents', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = {
        id: Date.now().toString(),
        name: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        type: req.file.mimetype,
        uploadedAt: new Date().toISOString(),
        status: 'processed'
    };
    adminConfig.documents.push(doc);
    console.log(`[Admin] Document uploaded: ${doc.name}`);

    // Process document for Knowledge Assist (background)
    knowledgeService.processDocument(doc, req.file.path).then(success => {
        const d = adminConfig.documents.find(item => item.id === doc.id);
        if (d) d.status = success ? 'ready' : 'error';
        io.emit('config_updated', adminConfig);
    });

    res.json({ success: true, document: doc });
});

app.get('/api/admin/documents', (req, res) => {
    res.json(adminConfig.documents);
});

app.delete('/api/admin/documents/:id', (req, res) => {
    const doc = adminConfig.documents.find(d => d.id === req.params.id);
    if (doc) {
        const filepath = path.join(uploadsDir, doc.filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        adminConfig.documents = adminConfig.documents.filter(d => d.id !== req.params.id);
    }
    res.json({ success: true });
});

// Clear chat history
app.delete('/api/admin/chat-history', (req, res) => {
    const { conversationId } = req.body;
    if (conversationId && conversations[conversationId]) {
        conversations[conversationId].messages = [];
        io.to(conversationId).emit('chat_history', []);
    } else {
        conversations = {};
        io.emit('chat_history', []);
    }
    io.emit('update_conversations', Object.values(conversations));
    res.json({ success: true });
});

// Generate conversation summary using Gemini
app.post('/api/admin/generate-summary', async (req, res) => {
    try {
        const { conversationId } = req.body;
        const conv = conversations[conversationId];
        if (!geminiModel) return res.status(503).json({ error: 'Gemini AI not configured' });
        if (!conv || conv.messages.length === 0) return res.status(400).json({ error: 'No conversation to summarize' });

        const transcript = conv.messages.map(m => `${m.role.toUpperCase()} [${m.time}]: ${m.text}`).join('\n');
        const prompt = `${adminConfig.summaryPrompt}\n\n--- CONVERSATION ---\n${transcript}\n--- END ---`;

        const result = await geminiModel.generateContent(prompt);
        const summary = result.response.text();
        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Real-time AI coaching via Gemini (for voice + chat)
app.post('/api/coaching', async (req, res) => {
    try {
        const { transcript } = req.body;
        if (!geminiModel) return res.status(503).json({ error: 'Gemini AI not configured' });
        if (!transcript || transcript.length === 0) return res.json({ coaching: null });

        const transcriptText = transcript
            .map(m => `${(m.role || m.speaker || 'unknown').toUpperCase()}: ${m.text}`)
            .join('\n');

        // Knowledge Retrieval
        const lastMessage = transcript[transcript.length - 1]?.text || '';
        const knowledgeContext = await knowledgeService.search(lastMessage, 2);
        const contextString = knowledgeContext.length > 0
            ? `\n\n--- RELEVANT KNOWLEDGE ---\n${knowledgeContext.map(k => `[From ${k.docName}]: ${k.text}`).join('\n---\n')}\n--- END KNOWLEDGE ---`
            : '';

        const prompt = `${adminConfig.coachingPrompt}${contextString}\n\n--- LIVE CONVERSATION ---\n${transcriptText}\n--- END ---`;
        const result = await geminiModel.generateContent(prompt);
        const raw = result.response.text().trim();

        // Strip markdown code fences if Gemini wrapped the JSON
        const cleaned = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            const coaching = JSON.parse(cleaned);
            return res.json({ success: true, coaching, knowledgeContext });
        } catch {
            // Fallback: extract first JSON object from the text
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const coaching = JSON.parse(jsonMatch[0]);
                return res.json({ success: true, coaching, knowledgeContext });
            }
            return res.json({ success: false, error: 'Could not parse coaching JSON', knowledgeContext });
        }
    } catch (error) {
        console.error('[Coaching] Error:', error.message);
        res.status(500).json({ error: 'Failed to generate coaching' });
    }
});

// Standalone Knowledge Search (for manual agent queries)
app.post('/api/knowledge/search', async (req, res) => {
    try {
        const { query, limit } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        const results = await knowledgeService.search(query, limit || 5);
        res.json({ success: true, results });
    } catch (error) {
        console.error('[Knowledge Search] Error:', error.message);
        res.status(500).json({ error: 'Failed to search knowledge base' });
    }
});

// Generate voice call summary using Gemini
app.post('/api/voice/summary', async (req, res) => {
    try {
        const { transcript } = req.body;
        if (!geminiModel) return res.status(503).json({ error: 'Gemini AI not configured' });
        if (!transcript) return res.status(400).json({ error: 'No transcript provided' });

        const prompt = `${adminConfig.summaryPrompt}\n\n--- VOICE CALL TRANSCRIPT ---\n${transcript}\n--- END ---`;
        const result = await geminiModel.generateContent(prompt);
        const summary = result.response.text();
        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate voice summary' });
    }
});


app.post('/api/admin/end-conversation', async (req, res) => {
    try {
        const { conversationId } = req.body;
        const conv = conversations[conversationId];
        if (!conv) return res.status(404).json({ error: 'Not found' });

        let summary = null;
        if (geminiModel && conv.messages.length > 0) {
            const transcript = conv.messages.map(m => `${m.role.toUpperCase()} [${m.time}]: ${m.text}`).join('\n');
            const prompt = `${adminConfig.summaryPrompt}\n\n--- CONVERSATION ---\n${transcript}\n--- END ---`;
            const result = await geminiModel.generateContent(prompt);
            summary = result.response.text();
        }

        // Remove conversation or mark as closed
        delete conversations[conversationId];
        io.to(conversationId).emit('conversation_ended', { summary });
        io.emit('update_conversations', Object.values(conversations));

        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- Serve React frontend (production) ----------------------------
// In production (Cloud Run), Express serves the built Vite output.
// In development, Vite's dev server handles the frontend on port 3005.
if (process.env.NODE_ENV === 'production') {
    import('url').then(({ fileURLToPath }) => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const distPath = path.join(__dirname, '..', 'dist');
        app.use(express.static(distPath));
        // SPA fallback: serve index.html for any non-API route
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
        console.log('[Static] Serving React frontend from', distPath);
    });
}

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

