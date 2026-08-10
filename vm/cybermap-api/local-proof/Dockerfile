FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db
COPY local-proof ./local-proof

USER node
EXPOSE 8080
