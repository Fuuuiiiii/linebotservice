FROM node:22-alpine

WORKDIR /app
ENV MODEL_PROVIDER=ollama
ENV OLLAMA_BASE_URL=http://host.docker.internal:11434
ENV OLLAMA_MODEL=llama3.2:3b

COPY package*.json ./
COPY server.mjs ./
COPY ./src ./src
COPY ./public ./public

RUN npm install \
    && npm run build \
    && npm prune --omit=dev

EXPOSE 3000

CMD [ "npm", "run", "serve:api" ]
