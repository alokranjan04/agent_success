# ── Stage 1: Build the React frontend ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL deps (including devDeps for vite build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production image ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy package files and install ONLY production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend and server
COPY --from=builder /app/dist ./dist
COPY server ./server

# Create uploads dir
RUN mkdir -p uploads

# Cloud Run always uses PORT 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server/index.js"]
