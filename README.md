# 🃏 es-timados (Front-End)

**es-timados** is a collaborative, real-time agile estimation and planning poker application. It is designed to streamline team consensus, eliminate authority bias, and facilitate splitting complex user stories using standard estimation decks along with specialized action cards.

---

## 🚀 Key Features

* **Real-time Communication**: Syncs instantly across moderators, developers, and product owners using ASP.NET Core SignalR.
* **Role-based Rooms**:
  * **Moderators**: Host sessions, control voting stages, reveal/reset votes, approve or reject joining participants, and finalize estimations.
  * **Developers (Voters)**: Cast votes on the active story card.
  * **Product Owners (Observers)**: View estimation progress and results without voting.
* **Custom & Special Cards**:
  * **1, 2, 3, 5, 8**: Standard Fibonacci-like story points.
  * **🪓 Axe (Axe Protocol)**: Used to halt voting if a story is too complex, ambiguous, or needs to be split.
  * **📊 Diagram**: Indicates that architecture diagrams, sequence flows, or technical designs are required before estimating.
  * **🤖 AI**: Flagged when technical uncertainty is high, suggesting the use of AI assistance or prototyping.
  * **☕ Coffee Cup**: Indicates developer fatigue or deadlock, prompting a short break.
* **Consensus & Discrepancy Detection**: Highlights consensus, detects voting discrepancies, and alerts when special action cards are cast.
* **Robust Fail-safe Health System**: Continually monitors connection state. Health checks (`/health`) stop after 10 consecutive failures to prevent infinite network polling loops and prompt the user to refresh the page.

---

## 🛠️ Technology Stack

* **Core Framework**: [Astro 6](https://astro.build/) (configured in Server-Side Rendering (SSR) mode).
* **Styling**: Modern, responsive layout with custom Vanilla CSS variables, retro-obsidian gradients, and subtle micro-animations.
* **Real-time Sync**: [@microsoft/signalr](https://www.npmjs.com/package/@microsoft/signalr) client connection.
* **Deployment**: [@astrojs/vercel](https://docs.astro.build/en/guides/integrations-guide/vercel/) SSR adapter (builds to Vercel Serverless Functions).
* **Testing**: [Vitest](https://vitest.dev/) unit testing suite.

---

## 📂 Project Structure

```text
/
├── public/                # Static assets (favicons, fonts, logos)
├── src/
│   ├── components/        # Reusable Astro components (Deck, ParticipantList, RevealResults)
│   ├── layouts/           # Page wrapper Layout with shared themes and offline banners
│   ├── pages/             # Route endpoints (Home page and dynamic room pages)
│   │   ├── index.astro            # Home / Join Room / Create Room UI
│   │   └── room/
│   │       └── [roomId].astro     # Active estimation room dashboard
│   └── scripts/           # Core state logic and connection scripts
│       ├── RoomSession.ts         # Main class wrapper for API/SignalR connection logic
│       └── RoomSession.test.ts    # Vitest suites for RoomSession connections and offline states
├── astro.config.mjs       # Astro configuration (Vercel Adapter config)
├── package.json           # Scripts, dependencies, and engines
└── tsconfig.json          # TypeScript configurations
```

---

## 🧞 Commands

All commands are run from the root of the project:

| Command | Action |
| :--- | :--- |
| `npm install` | Installs dependencies |
| `npm run dev` | Starts local development server |
| `npm run build` | Builds production bundle for Vercel deployment |
| `npm run preview` | Previews the build output locally |
| `npm run test` | Runs the Vitest unit tests |

---

## ⚙️ Environment Configuration

By default, the client talks to the backend API at `http://localhost:5011`. This can be adjusted inside the scripts/pages if your backend API runs on a different address or domain.
