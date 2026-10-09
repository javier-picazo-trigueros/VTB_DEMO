FROM node:24-alpine
WORKDIR /app

# sqlite3 se compila con node-gyp: Alpine no trae compilador ni Python.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Compila TypeScript. Las dependencias de desarrollo se quedan: el seed
# (`npm run seed`) se ejecuta con tsx dentro del contenedor.
RUN npm run build

# Directorio de la base SQLite. Es el punto de montaje del volumen: se crea
# antes de bajar de privilegios para que el usuario node pueda escribir.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/index.js"]
