## SnapRoom

Public, anonymous web app that lets anyone upload a single room photo and get:

- Rough **length / width / height** estimates (with a confidence score)
- Practical improvement suggestions across:
  - camera, lighting, acoustics, display, seating, cabling, network, power

Built with Next.js (App Router) and the Vercel AI SDK.

## Getting Started

### 1) Configure environment variables

Create `.env.local` in the project root:

```bash
# Required for room photo analysis (/api/analyze)
ANTHROPIC_API_KEY=your_key_here

# Photorealistic Workspace Designer render on /results (/api/designer-photorealistic)
# Prefer Gemini (Google AI Studio API key):
GEMINI_API_KEY=your_gemini_key_here
# Optional — image model id (changes when Google renames previews):
# GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview

# Or use OpenAI image edits instead / as fallback when GEMINI_API_KEY is unset:
# OPENAI_API_KEY=your_openai_key_here
# OPENAI_IMAGE_MODEL=dall-e-2

# Optional (analysis):
# ANTHROPIC_MODEL=claude-sonnet-4-6
# ANTHROPIC_FALLBACK_MODEL=claude-haiku-4-5   # used if primary is overloaded
```

### 2) Install and run

If you already use `pnpm`:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deploying on Vercel (recommended)

- Push this repo to GitHub
- Import it in Vercel
- Add **`ANTHROPIC_API_KEY`** and **`GEMINI_API_KEY`** for photorealistic renders (or **`OPENAI_API_KEY`** if you skip Gemini), plus optional model overrides, under **Settings → Environment Variables**
- Ensure the variable is enabled for **Production** (not only Preview), click **Save**, then **Redeploy**
- Deploy

## Notes / limitations

- Dimension estimates from a **single photo** are inherently rough. Including a reference object (credit card, paper, or known ceiling height) improves the estimate.
- v1 does not store photos server-side; it sends the image to the model for analysis and returns structured JSON.
- **Anthropic**: if you set `ANTHROPIC_MODEL` on Vercel, use a current API model id (for example `claude-sonnet-4-6`). Old aliases such as `claude-3-5-sonnet-latest` often stop working when Anthropic retires them.
- **Overload**: if the primary Claude model hits “high demand”, the API retries with backoff and can use **`ANTHROPIC_FALLBACK_MODEL`** (default Haiku).
- **Photorealistic Designer renders** prefer **Google Gemini** (`GEMINI_API_KEY`, default image model **`gemini-3.1-flash-image-preview`** via `GEMINI_IMAGE_MODEL`). If **`GEMINI_API_KEY`** is not set, the route falls back to **OpenAI** **`images/edits`** (**`dall-e-2`** default, configurable with **`OPENAI_IMAGE_MODEL`**).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
