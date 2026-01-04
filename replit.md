# LeagueVault

## Overview

LeagueVault is a fantasy sports financial management platform that enables league commissioners and members to manage dues collection, payouts, and weekly scoring. The application provides secure payment processing through Stripe, user authentication via Replit Auth, and supports custom league configurations with automated payout rules.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with HMR support
- **Animations**: Framer Motion for page transitions

The frontend follows a pages-based structure under `client/src/pages/` with shared components in `client/src/components/`. Custom hooks in `client/src/hooks/` abstract API calls and authentication logic.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod validation
- **Authentication**: Replit Auth (OpenID Connect) with session management
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Build**: esbuild for production bundling with dependency optimization

The server uses a modular structure with routes registered in `server/routes.ts`, database operations abstracted through `server/storage.ts`, and authentication isolated in `server/replit_integrations/auth/`.

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` with models in `shared/models/`
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple
- **Migrations**: Drizzle Kit with push-based schema sync (`npm run db:push`)

Core entities: Users, Leagues, LeagueMembers, Payments, Payouts, WeeklyScores

### Authentication
- **Provider**: Replit Auth using OpenID Connect
- **Session Management**: Express-session with PostgreSQL store
- **User Storage**: Automatic upsert on login via `authStorage.upsertUser()`
- **Protected Routes**: `isAuthenticated` middleware guards API endpoints

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts`: Drizzle table definitions and Zod schemas
- `routes.ts`: API route definitions with input/output validation
- `models/auth.ts`: User and session table definitions

## External Dependencies

### Payment Processing
- **Stripe**: Integrated via Replit Connectors for payment collection and payouts
- **Webhook Handling**: Raw body preservation for signature verification
- **Environment Modes**: Separate development/production credentials

### Database
- **PostgreSQL**: Primary data store (provision via Replit Database)
- **Connection**: Pool-based via `pg` package with `DATABASE_URL` environment variable

### Authentication
- **Replit Auth**: OpenID Connect provider at `https://replit.com/oidc`
- **Required Secrets**: `SESSION_SECRET`, `REPL_ID` (auto-provided by Replit)

### Frontend Libraries
- **UI Components**: Radix UI primitives with shadcn/ui styling
- **Charts**: Recharts for financial visualizations
- **Date Handling**: date-fns for formatting
- **Forms**: React Hook Form with Zod resolver

### Development Tools
- **Vite Plugins**: Replit-specific plugins for cartographer, dev banner, and error overlay
- **TypeScript**: Strict mode with path aliases (`@/` for client, `@shared/` for shared)

## Automation Features

### Weekly Score Sync Automation
- **HPS (Highest Point Scorer)**: Automatically credits weekly prize to highest scorer's wallet after score sync
- **LPS (Lowest Point Scorer)**: Automatically creates payment request for lowest scorer when LPS fee is enabled
- **LPS Payment Page**: Public page at `/pay-lps/:token` allows members to pay their LPS fee

### Payment Reminders System (Infrastructure Ready)
- **Phone Numbers**: League members can have phone numbers stored for SMS reminders
- **Reminder Types**: Pre-season, weekly, and final notice reminders supported
- **Commissioner Controls**: Only commissioners can send reminders via Commish Tools tab
- **League Start Date**: Leagues can have a start date set for scheduling purposes
- **Manual Trigger**: Commissioners can send reminders to all unpaid members

### ESPN Integration
- **Real Score Syncing**: When ESPN League ID is configured, scores are fetched from ESPN's Fantasy Football API
- **Team Mapping**: Commissioners can map league members to ESPN teams for accurate score syncing
- **Private League Support**: For private ESPN leagues, commissioners can provide espn_s2 and SWID cookies
- **API Endpoints Used**:
  - `https://fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{LEAGUE_ID}?view=mTeam&view=mMatchupScore`
- **Fallback**: If ESPN integration fails or isn't configured, mock scores are generated with source marked as "mock"
- **Error Reporting**: ESPN failures and unmapped members are surfaced to commissioners via toast notifications after sync

### Pending Integrations
- **Twilio SMS**: Configured and active. SMS notifications are sent for:
  - LPS payment requests (automatically on score sync)
  - Payment reminders (manually triggered by commissioners)
- **Automated Scheduling**: Pre-season reminder automation requires a cron/scheduler service. Manual triggers are available in Commish Tools.

## Future Roadmap

### Interest-Bearing Fund Holding (Requires Legal Consultation)
- **Concept**: Hold pooled league dues in an interest-bearing account to generate revenue
- **Requirements**:
  - Money Transmitter License (state-by-state, $50K-$500K+ in bonds/fees)
  - Fintech attorney consultation for compliance
  - Clear Terms of Service disclosure
  - Possible escrow/trust account requirements
- **Options to Explore**:
  - Stripe Treasury (Financial Accounts for platforms)
  - Partnership with licensed bank/fintech
  - Becoming a licensed money transmitter
- **Status**: Research phase - requires legal guidance before implementation