FROM node:20-alpine

WORKDIR /app

# Install dependencies including dev (needed for ts-node)
COPY package*.json ./
RUN npm install
RUN npm install -g ngrok

# App sources
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 4040

USER node

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]