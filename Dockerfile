FROM node:20-alpine

WORKDIR /app

# Install dependencies including dev (needed for ts-node)
COPY package*.json ./
RUN npm install

# App sources
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

USER node

CMD ["npx", "ts-node", "src/index.ts"]