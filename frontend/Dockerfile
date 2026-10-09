# Etapa 1: build. Node 24 porque es el que declara `engines` en package.json.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
# --legacy-peer-deps igual que frontend/vercel.json: sin él `npm ci` falla por
# conflictos de peerDependencies.
RUN npm ci --legacy-peer-deps

COPY . .

# En producción la API es siempre /backend (el proxy de nginx, ver nginx.conf),
# así que VITE_API_URL no se pasa: se ignoraría igualmente.
ARG VITE_EXPLORER_URL=http://localhost:8545
ARG VITE_CONTRACT_ADDRESS
ARG VITE_RPC_URL=http://localhost:8545

ENV VITE_EXPLORER_URL=$VITE_EXPLORER_URL
ENV VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS
ENV VITE_RPC_URL=$VITE_RPC_URL

RUN npm run build

# Etapa 2: nginx sirve el build y hace de proxy de /backend hacia el backend.
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
