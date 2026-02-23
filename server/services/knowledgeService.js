import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const VECTOR_DB_PATH = path.resolve('server/vector-db.json');

class KnowledgeService {
    constructor(apiKey) {
        if (!apiKey) {
            console.error('[Knowledge] No API Key provided! Knowledge features will be disabled.');
            this.enabled = false;
        } else {
            console.log(`[Knowledge] Initializing with key: ${apiKey.substring(0, 6)}...`);
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.embeddingModel = this.genAI.getGenerativeModel({ model: "gemini-embedding-001" });
            this.enabled = true;
        }
        this.db = this.loadDb();
    }

    loadDb() {
        if (fs.existsSync(VECTOR_DB_PATH)) {
            try {
                return JSON.parse(fs.readFileSync(VECTOR_DB_PATH, 'utf-8'));
            } catch (e) {
                console.error('[Knowledge] Error loading Vector DB:', e);
                return { documents: [], chunks: [] };
            }
        }
        return { documents: [], chunks: [] };
    }

    saveDb() {
        try {
            fs.writeFileSync(VECTOR_DB_PATH, JSON.stringify(this.db, null, 2));
        } catch (e) {
            console.error('[Knowledge] Failed to save Vector DB:', e);
        }
    }

    async processDocument(docMetadata, filePath) {
        if (!this.enabled) return;

        try {
            console.log(`[Knowledge] Processing: ${docMetadata.name}`);
            const text = fs.readFileSync(filePath, 'utf-8');

            // 1. Chunking
            const chunkSize = 1500;
            const overlap = 300;
            const chunks = this.chunkText(text, chunkSize, overlap);

            console.log(`[Knowledge] Generated ${chunks.length} chunks`);

            // 2. Embedding Generation (Batching recommended for efficiency, but one-by-one for simplicity here)
            const processedChunks = [];
            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                const embedding = await this.getEmbedding(chunkText);
                processedChunks.push({
                    docId: docMetadata.id,
                    docName: docMetadata.name,
                    chunkIndex: i,
                    text: chunkText,
                    embedding: embedding
                });
            }

            // 3. Update DB
            this.db.documents.push(docMetadata);
            this.db.chunks.push(...processedChunks);
            this.saveDb();
            console.log(`[Knowledge] Successfully indexed ${docMetadata.name}`);

            return true;
        } catch (error) {
            console.error(`[Knowledge] Error processing ${docMetadata.name}:`, error.message);
            return false;
        }
    }

    chunkText(text, size, overlap) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            let end = Math.min(start + size, text.length);
            chunks.push(text.slice(start, end));
            if (end === text.length) break;
            start += (size - overlap);
        }
        return chunks;
    }

    async getEmbedding(text, isQuery = false) {
        try {
            const result = await this.embeddingModel.embedContent({
                content: { parts: [{ text }] },
                taskType: isQuery ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT"
            });
            return result.embedding.values;
        } catch (e) {
            console.error(`[Knowledge] Embedding error (${isQuery ? 'Query' : 'Doc'}):`, e);
            return null; // Return null instead of zeros to flag failure
        }
    }

    async search(query, limit = 3) {
        if (!this.enabled || this.db.chunks.length === 0) return [];

        try {
            const queryEmbedding = await this.getEmbedding(query, true);
            if (!queryEmbedding) return [];

            const scored = this.db.chunks
                .filter(chunk => chunk.embedding && chunk.embedding.some(v => v !== 0))
                .map(chunk => ({
                    text: chunk.text,
                    docName: chunk.docName,
                    score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
                }));

            // Filter for decent similarity and sort
            return scored
                .filter(s => s.score > 0.45) // Threshold for relevance
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        } catch (e) {
            console.error('[Knowledge] Search error:', e.message);
            return [];
        }
    }

    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}

export default KnowledgeService;
