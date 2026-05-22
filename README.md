# Customer Service Chatbot

A customer service chatbot for web and LINE Messaging API. The app provides quick-reply menu flows for orders, product issues, and the quality reward program, with optional AI-assisted responses through the backend service.

## Features

- React web chat interface
- Express backend API
- LINE webhook support
- Quick-reply menu flow aligned between web and LINE
- Local model support through Ollama

## Start

```powershell
npm install
npm run build
npm run serve:api
```

Open:

```text
http://localhost:3000
```

## Configuration

Create a local `.env` file from `.env.example`, then fill in the required values on your own machine.

Do not commit API keys, channel secrets, access tokens, or other private credentials.
