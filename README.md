# AI Patch Crawler

PoC: pick **Node.js LTS**, **Python**, or **Chrome**, get **name**, **version**, **end-of-shelf** (or Unknown), and a **copyable Windows x64 download URL**. An LLM extracts those fields from the official vendor page, winget installer manifests, and [endoflife.date](https://endoflife.date) (hallucinations rejected).

## Workflow

```mermaid
flowchart TD
    User([User picks product<br/>Node.js LTS / Python / Chrome]) --> UI[Next.js page<br/>src/app/page.tsx]
    UI -->|"POST /api/latest {product}"| API[API route<br/>src/app/api/latest/route.ts]

    API --> Cache{In-memory cache hit?<br/>15 min TTL}
    Cache -->|yes| Return

    Cache -->|no| Seed[Fetch seed source<br/>vendor page or winget manifest dir]
    Seed --> Sparse{Absolute https<br/>.exe / .msi URL found?}
    Sparse -->|no| Winget[Fallback: winget-pkgs on GitHub<br/>descend to latest version dir<br/>fetch installer.yaml]
    Sparse -->|yes| EolCheck
    Winget --> EolCheck{Product has<br/>EOL source?}
    EolCheck -->|yes| Eol[Fetch endoflife.date API<br/>compact to 'cycle X: eol DATE']
    EolCheck -->|no| Excerpt
    Eol --> Excerpt[Combined text excerpt<br/>≤ 40k chars]

    Excerpt --> LLM[OpenAI LLM extraction<br/>JSON: name, version, endOfShelf, url]

    LLM --> Validate{Validate against excerpt}
    Validate -->|URL or version not in excerpt,<br/>non-https, bad version| Error[502 error shown in UI]
    Validate -->|ok| Eos[endOfShelf kept only if verbatim<br/>in excerpt and not a ReleaseDate,<br/>else Unknown]
    Eos --> Store[Cache result] --> Return[JSON response]
    Return --> Result([UI shows name, version,<br/>end of shelf, copyable URL])
```

| Product | Installer URL source | EOS date source |
|---------|----------------------|-----------------|
| Node.js LTS | winget `OpenJS.NodeJS.LTS` manifest | endoflife.date `nodejs` |
| Python | python.org Windows downloads page (winget fallback) | endoflife.date `python` |
| Chrome | google.com/chrome (winget `Google.Chrome` fallback) | none (Unknown) |

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
