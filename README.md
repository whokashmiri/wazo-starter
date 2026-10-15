# Wazo SaaS Starter (LOCAL DEVELOPMENT ONLY)

A tiny Express backend and HTML frontend. It talks to your running Wazo Docker stack through `https://localhost:8443` and supports:

1. Check Wazo API authentication.
2. List Wazo tenants.
3. Create a Wazo tenant (company).
4. List telephony users for a selected tenant.
5. Create a basic telephony user in the selected tenant.

**It does not yet configure SIP extensions, lines, queues, IVRs, or phone numbers.** Creating a tenant alone does not make a functioning call center. It also does not include SaaS accounts, customer authentication, billing, or tenant policy enforcement. Never expose this app to the internet or customers.

## Run on Windows PowerShell

In a different terminal, keep your existing `wazo-docker` services running.

```powershell
cd C:\Codebase\Vision\ivr-cloud\wazo-saas-starter
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```

In `.env`, enter credentials for a **dedicated Wazo API administrator/service account** authorized to list/create tenants and confd users. No credentials are embedded in the frontend. For local testing you may use an appropriate existing administrative account, but create a least-privileged API account before any shared deployment.

Open `http://127.0.0.1:3100`.

## API paths

- `GET /api/health`
- `GET /api/tenants`
- `POST /api/tenants` JSON `{ "name": "Company A" }`
- `GET /api/tenants/:uuid/users`
- `POST /api/tenants/:uuid/users` JSON `{ "firstname": "Ahmed", "lastname": "Saleh" }`

All Wazo calls go server-side through Nginx's `/api/auth/0.1` and `/api/confd/1.1` proxy routes. Auth uses HTTP Basic token exchange, and API calls use `X-Auth-Token` and `Wazo-Tenant` headers. An operator's permissions determine whether calls succeed.

## Security / caveats

- This sample deliberately listens on **127.0.0.1 only**, and no customer login is implemented. It is an administrator-operated local proof of concept.
- `WAZO_DEV_INSECURE_TLS=true` skips certificate validation **only for loopback Wazo in development**. Use a trusted cert and set to false in production.
- Wazo's root administrator generally needs the appropriate tenant permissions to create child tenants. A `403` means the Wazo API account lacks the required policy.
- Tenant isolation is not yet tested. Do not invite real customers or store real customer call data here.
- User creation is *basic telephony user creation*, not a fully usable SIP account. Next milestone: contexts + SIP lines + extensions and explicit associations.
- Wazo endpoint and payload compatibility can vary by Wazo version; the first test is the connection/list-tenants action before attempting any mutation.
