# Frontend (Next.js)

Storefront and admin panel. See the [project README](../README.md) for setup and architecture.

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000 (expects the API on http://localhost:4000)
npm run build && npm start
npm run lint
```

| Path | Contents |
| --- | --- |
| `src/app/(shop)/` | storefront: home, products, cart, checkout, login, account, bulk orders, policies |
| `src/app/admin/` | admin panel: dashboard, orders, products, categories, customers, bulk enquiries |
| `src/components/ui.tsx`, `modal.tsx` | shared UI primitives |
| `src/components/providers.tsx` | auth, cart, store config and toast contexts |
| `src/components/shop/`, `src/components/admin/` | feature components |
| `src/lib/api.ts` | browser API client (calls `/api/*`, proxied to the backend) |
| `src/lib/server-api.ts` | Server Component data fetching (public catalog data) |
| `src/lib/types.ts` | API types, mirrored from [docs/API.md](../docs/API.md) |
| `src/proxy.ts` | redirects logged-out visitors away from account, checkout and admin pages |

This project uses Next.js 16; read `node_modules/next/dist/docs/` before changing framework-level code
(see `AGENTS.md`). Product images use plain `<img>` (`ProductImg`) because they may come from the local
API or an S3/CDN host.
