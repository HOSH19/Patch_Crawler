# AI Patch Crawler

PoC: pick **VS Code** or **Chrome**, get **name**, **version**, **end-of-shelf** (or Unknown), and a **copyable Windows x64 download URL**. An LLM extracts those fields from the official vendor page (hallucinations rejected).

## Run

```bash
cp .env.example .env.local   # set OPENAI_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

Without `OPENAI_API_KEY`, the UI loads but **Find latest** fails.

## Env

| Variable | Required | Notes |
|----------|----------|-------|
| `OPENAI_API_KEY` | yes | OpenAI key for extraction |
| `OPENAI_MODEL` | no | default `gpt-4o-mini` |
