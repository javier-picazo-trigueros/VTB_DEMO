# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Variables de build pasadas como ARG
ARG VITE_API_URL=http://localhost:3001
ARG VITE_EXPLORER_URL=http://localhost:8545
ARG VITE_CONTRACT_ADDRESS
ARG VITE_RPC_URL=http://localhost:8545

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_EXPLORER_URL=$VITE_EXPLORER_URL
ENV VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS
ENV VITE_RPC_URL=$VITE_RPC_URL

RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
