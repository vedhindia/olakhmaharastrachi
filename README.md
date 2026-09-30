# Ashoka E‑commerce Monorepo

A monorepo containing three related workspaces that together power the
Ashoka shopping platform:

- **`Ashoka/`** – the customer‑facing React website.
- **`admin-panel/`** – a React-based dashboard used by staff to manage
  products, orders, users, etc.
- **`backend/`** – a Node.js/Express API providing data and authentication
  for both frontends.

## Prerequisites

Before you begin, make sure you have the following installed on your
machine:

- [Node.js](https://nodejs.org/) v18 or newer
- npm v9 or newer (bundled with Node.js)

> We recommend using a Node version manager such as `nvm` or `volta` to
> switch between versions if needed.

## Setup

Install all dependencies for every workspace from the repository root:

```bash
npm install
```

Each workspace also has its own `package.json` and may require additional
commands; the root install installs them automatically thanks to the
monorepo configuration.

## Development

The following npm scripts are defined in the root `package.json`
and proxy to the appropriate workspace:

| Task                     | Command                      | Description                        |
|--------------------------|------------------------------|------------------------------------|
| Start customer site      | `npm run start:ashoka`       | Launches the `Ashoka` frontend     |
| Start admin panel        | `npm run start:admin`        | Launches the admin dashboard       |
| Start backend API        | `npm run start:backend`      | Starts Express server on `:5000`   |
| Run tests (all workspaces)| `npm test`                  | Executes any configured tests      |

When running in development, the frontends automatically proxy API
requests to the backend so you can work on all parts concurrently.

## CI / CD

Continuous integration is handled with GitHub Actions.  The current
workflow lives in `.github/workflows/ci.yml` and is executed on every
push to `main`.  It installs dependencies, runs linting/tests, and
builds each workspace for deployment.

> **Note:** if you add new workspaces or change the build steps, make
> sure to update the workflow accordingly.

## Additional Notes

- Static assets are stored under each workspace’s `public/` or
  `uploads/` directory.
- Database configuration and environment variables are managed in
  `backend/src/config/`.
- For API documentation see `backend/README.md` (if present).

---

Feel free to extend this README with architecture diagrams, deployment
instructions, or contribution guidelines as the project evolves.
