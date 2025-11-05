# Code Cleanup & Improvement Plan

**Date**: 2025-11-05  
**Priority Levels**: 🔴 High | 🟡 Medium | 🟢 Low  
**Effort Estimates**: S (Small, <2h) | M (Medium, 2-8h) | L (Large, >8h)  

---

## 🎯 Overview

This document outlines code cleanup opportunities, technical debt reduction, and quality improvements based on comprehensive codebase analysis.

**Current State**: 
- ✅ Zero security vulnerabilities
- ✅ Zero TODO/FIXME comments
- ✅ Production-ready code quality
- ⚠️ Minimal testing infrastructure
- ⚠️ No CI/CD automation

**Goals**:
1. Add automated testing
2. Improve code maintainability
3. Enhance observability
4. Set up CI/CD pipeline

---

## 📋 Cleanup Tasks

### 1. Code Organization

#### 1.1 Extract Custom Hooks (🟢 Low Priority, S)

**Files Affected**: `app/src/components/RoomList.tsx`

**Current**:
```typescript
// RoomList.tsx - inline fetch logic
useEffect(() => {
  const fetchRooms = async () => {
    try {
      const response = await fetch("/api/rooms/open");
      const data = await response.json();
      setRooms(data.rooms || []);
    } catch (error) {
      console.error("Failed to load rooms:", error);
    }
  };
  fetchRooms();
  const interval = setInterval(fetchRooms, 5000);
  return () => clearInterval(interval);
}, []);
```

**Proposed**:
```typescript
// hooks/useRoomList.ts
export function useRoomList(refreshInterval = 5000) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/rooms/open");
        const data = await response.json();
        setRooms(data.rooms || []);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRooms();
    const interval = setInterval(fetchRooms, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);
  
  return { rooms, loading, error };
}

// RoomList.tsx - usage
const { rooms, loading, error } = useRoomList(5000);
```

**Benefits**:
- Reusable across components
- Easier to test
- Better error handling
- Loading states exposed

---

#### 1.2 Centralize Type Definitions (🟡 Medium Priority, S)

**Files Affected**: 
- `app/src/App.tsx`
- `app/src/components/AuthScreen.tsx`
- `worker/src/router.ts`

**Current**: User type defined in multiple places

**Proposed**:
```typescript
// shared/src/types.ts (add to existing)
export interface User {
  id: string;
  name: string;
  email?: string;
  token?: string;
  isGuest?: boolean;
  avatar?: string;
  xp?: number;
  level?: number;
}

export interface UserProfile {
  userId: string;
  avatar: string;
  xp: number;
  level: number;
  createdAt: number;
  lastLogin: number;
}
```

**Action Items**:
1. Move User type to `shared/src/types.ts`
2. Update all imports
3. Remove duplicate definitions
4. Ensure client/server type consistency

---

#### 1.3 Extract Constants (🟢 Low Priority, S)

**Files Affected**: Multiple

**Current**: Magic numbers scattered throughout

**Proposed**:
```typescript
// shared/src/constants.ts
export const GAME_CONSTANTS = {
  XP_PER_LEVEL: 100,
  XP_WINNER: 50,
  XP_PARTICIPANT: 10,
  XP_PERFECT_ROLL: 25,
} as const;

export const UI_CONSTANTS = {
  ROOM_REFRESH_INTERVAL_MS: 5000,
  ANIMATION_DURATION_MS: 400,
  TOAST_DURATION_MS: 3000,
} as const;

export const AVATAR_OPTIONS = [
  "🎲", "🎯", "🎰", "🃏", "🎪", "🎭", "🎨", "🎸",
  "🚀", "⚡", "🔥", "💎", "👑", "🦁", "🐉", "🦅",
  "🌟", "⭐", "✨", "💫", "🌈", "🎃", "🎄", "🎁"
] as const;

export type Avatar = typeof AVATAR_OPTIONS[number];
```

**Usage**:
```typescript
import { GAME_CONSTANTS } from "../../shared/src/constants";

const newLevel = Math.floor(xp / GAME_CONSTANTS.XP_PER_LEVEL) + 1;
```

---

### 2. CSS Refactoring

#### 2.1 Split Large CSS File (🟡 Medium Priority, M)

**Current**: Single `styles.css` (50KB)

**Proposed Structure**:
```
app/src/styles/
├── base.css          (resets, variables, typography)
├── layout.css        (grid, flexbox, spacing)
├── components.css    (buttons, cards, badges)
├── animations.css    (keyframes, transitions)
├── themes.css        (light/dark mode)
└── utilities.css     (helper classes)
```

**Benefits**:
- Better organization
- Easier maintenance
- Faster hot reload in dev
- Can be lazy-loaded

---

#### 2.2 Consolidate Duplicate Styles (🟢 Low Priority, S)

**Current**: Similar card styles in multiple places

**Proposed**: Create utility classes
```css
/* utilities.css */
.card-base {
  background: var(--surface-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--spacing-md);
}

.card-interactive {
  transition: all var(--duration-normal) var(--ease-out-quad);
}

.card-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}
```

---

### 3. Testing Infrastructure

#### 3.1 Add Unit Tests (🔴 High Priority, L)

**Create Test Files**:
```
app/src/rules/__tests__/
├── gameRules.test.ts
└── xpCalculation.test.ts

app/src/ppor/__tests__/
├── diceDetect.test.ts
└── capture.test.ts

shared/src/__tests__/
├── crypto.test.ts
└── stimuli.test.ts
```

**Example**:
```typescript
// gameRules.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateQuickDuel, isGameComplete } from '../gameRules';

describe('Quick Duel Rules', () => {
  it('should determine winner by highest total', () => {
    const rounds = [
      { userId: 'player1', values: [6, 6, 6], score: 18 },
      { userId: 'player2', values: [5, 5, 5], score: 15 }
    ];
    
    const result = evaluateQuickDuel(rounds, ['player1', 'player2']);
    
    expect(result.winner).toBe('player1');
    expect(result.xpRewards.player1).toBe(75); // 50 winner + 25 perfect
    expect(result.xpRewards.player2).toBe(10);
  });
  
  it('should handle ties with tiebreaker', () => {
    const rounds = [
      { userId: 'player1', values: [6, 3, 3], score: 12 },
      { userId: 'player2', values: [5, 4, 3], score: 12 }
    ];
    
    const result = evaluateQuickDuel(rounds, ['player1', 'player2']);
    
    expect(result.winner).toBe('player1'); // Higher max die
  });
});
```

**Setup**:
```bash
npm install -D vitest @vitest/ui
```

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

#### 3.2 Add E2E Tests (🟡 Medium Priority, M)

**Create Test Suite**:
```typescript
// e2e/user-journey.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Complete User Journey', () => {
  test('guest user can create room and see opponent', async ({ page, context }) => {
    // Start at auth screen
    await page.goto('http://localhost:5173');
    
    // Continue as guest
    await page.getByRole('button', { name: 'Continue as Guest' }).click();
    await expect(page).toHaveURL(/\//);
    
    // Select Quick Duel
    await page.getByRole('button', { name: 'Quick Duel' }).click();
    
    // Create room
    await page.getByRole('textbox', { name: 'Your name' }).fill('Player 1');
    await page.getByRole('button', { name: 'Roll out the welcome mat' }).click();
    
    // Verify room created
    await expect(page.getByText(/Room ID:/)).toBeVisible();
    
    // In second tab, join as opponent
    const page2 = await context.newPage();
    await page2.goto('http://localhost:5173');
    await page2.getByRole('button', { name: 'Continue as Guest' }).click();
    await page2.getByRole('button', { name: 'Quick Duel' }).click();
    await page2.getByRole('tab', { name: 'Join match' }).click();
    
    // Get room code from first page
    const roomCode = await page.locator('[data-room-code]').textContent();
    await page2.getByRole('textbox', { name: 'Table Code' }).fill(roomCode);
    await page2.getByRole('button', { name: 'Grab a seat' }).click();
    
    // Verify both players see each other
    await expect(page.getByText('Player 2')).toBeVisible();
    await expect(page2.getByText('Player 1')).toBeVisible();
  });
});
```

---

### 4. CI/CD Setup

#### 4.1 GitHub Actions Workflow (🔴 High Priority, S)

**Create**: `.github/workflows/ci.yml`
```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: kismet/package-lock.json
      
      - name: Install dependencies
        run: |
          cd kismet
          npm ci
      
      - name: Lint
        run: |
          cd kismet
          npm run lint
      
      - name: Type check
        run: |
          cd kismet/app
          npm run typecheck
      
      - name: Unit tests
        run: |
          cd kismet
          npm test
      
      - name: Build
        run: |
          cd kismet/app
          npm run build
      
      - name: E2E tests
        run: |
          cd kismet
          npm run test:e2e
```

---

#### 4.2 ESLint + Prettier Setup (🔴 High Priority, S)

**Install**:
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier
```

**Create**: `kismet/.eslintrc.json`
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off"
  }
}
```

**Create**: `kismet/.prettierrc.json`
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

---

### 5. Monitoring & Observability

#### 5.1 Add Error Tracking (🟡 Medium Priority, S)

**Option 1**: Cloudflare Workers Analytics (Free)
```typescript
// worker/src/analytics.ts
export function trackError(error: Error, context: Record<string, any>) {
  // Cloudflare Analytics API
  console.error('[ERROR]', {
    message: error.message,
    stack: error.stack,
    ...context,
    timestamp: Date.now()
  });
}
```

**Option 2**: Sentry (Recommended)
```typescript
// app/src/main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

---

#### 5.2 Add Analytics (🟢 Low Priority, S)

**Cloudflare Web Analytics** (Free, Privacy-friendly)
```html
<!-- index.html -->
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' 
        data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
```

**Track Custom Events**:
```typescript
// utils/analytics.ts
export function trackEvent(event: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.plausible) {
    window.plausible(event, { props: properties });
  }
}

// Usage
trackEvent('game_started', { mode: 'quick-duel' });
trackEvent('dice_rolled', { integrity_score: 92 });
```

---

### 6. Performance Optimizations

#### 6.1 Code Splitting (🟢 Low Priority, M)

**Current**: All components bundled together (196KB)

**Proposed**: Lazy load routes
```typescript
// App.tsx
import { lazy, Suspense } from 'react';

const GameModeSelect = lazy(() => import('./components/GameModeSelect'));
const RoomLobby = lazy(() => import('./components/RoomLobby'));
const DuelView = lazy(() => import('./components/DuelView'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      {screen === 'game-select' && <GameModeSelect />}
      {screen === 'lobby' && <RoomLobby />}
      {screen === 'duel' && <DuelView />}
    </Suspense>
  );
}
```

**Expected Improvement**: 20-30% reduction in initial bundle size

---

#### 6.2 Optimize Re-renders (🟢 Low Priority, S)

**Add Memoization**:
```typescript
// DuelView.tsx
const gameResult = useMemo(() => {
  if (isGameComplete(gameMode, state.roundHistory, playerIds)) {
    return evaluateGame(gameMode, state.roundHistory, playerIds);
  }
  return null;
}, [gameMode, state.roundHistory, playerIds]);

// Memoize expensive computations
const sortedPlayers = useMemo(() => 
  [...state.players].sort((a, b) => (b.xp || 0) - (a.xp || 0)),
  [state.players]
);
```

---

### 7. Documentation

#### 7.1 Add API Documentation (🟡 Medium Priority, M)

**Create**: `docs/API.md`
```markdown
# API Documentation

## Authentication

### POST /api/auth/signup
Create a new user account.

**Request Body**:
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "avatar": "string"
}
```

**Response** (201):
```json
{
  "userId": "string",
  "token": "string",
  "name": "string",
  "avatar": "string"
}
```
```

**Alternative**: Generate OpenAPI spec
```bash
npm install -D @apidevtools/swagger-cli
```

---

#### 7.2 Add Contributing Guidelines (🟢 Low Priority, S)

**Create**: `CONTRIBUTING.md`
```markdown
# Contributing to Kismet

## Development Setup
1. Clone the repository
2. Install dependencies: `cd kismet && npm install`
3. Start dev server: `cd app && npm run dev`

## Code Style
- Use TypeScript for all new code
- Follow existing naming conventions
- Add tests for new features
- Run `npm run lint` before committing

## Pull Request Process
1. Create feature branch from `main`
2. Make changes with descriptive commits
3. Add/update tests
4. Ensure CI passes
5. Request review from maintainers
```

---

## 🗓️ Implementation Timeline

### Week 1: Testing Foundation
- [ ] Set up Vitest
- [ ] Add unit tests for game rules
- [ ] Add unit tests for crypto utilities
- [ ] Set up Playwright E2E tests
- [ ] Create basic E2E user journey test

### Week 2: CI/CD & Tooling
- [ ] Set up ESLint + Prettier
- [ ] Create GitHub Actions CI workflow
- [ ] Set up automated deployment
- [ ] Configure Dependabot
- [ ] Add pre-commit hooks (Husky)

### Week 3: Code Cleanup
- [ ] Extract custom hooks
- [ ] Centralize type definitions
- [ ] Extract constants
- [ ] Split CSS into modules
- [ ] Add memoization where needed

### Week 4: Monitoring & Docs
- [ ] Add error tracking
- [ ] Set up analytics
- [ ] Create API documentation
- [ ] Write contributing guidelines
- [ ] Add JSDoc comments to complex functions

---

## 📊 Success Metrics

**Code Quality**:
- ✅ ESLint: 0 errors, <10 warnings
- ✅ Test coverage: >80% for critical paths
- ✅ Build time: <2s for incremental builds
- ✅ Bundle size: <200KB gzipped

**Developer Experience**:
- ✅ PR feedback: <30 minutes (CI)
- ✅ Local test run: <10 seconds
- ✅ Hot reload: <1 second
- ✅ Type checking: <5 seconds

**Reliability**:
- ✅ E2E test pass rate: >95%
- ✅ Production error rate: <0.1%
- ✅ Deployment success rate: 100%
- ✅ Uptime: >99.9%

---

## 💡 Nice-to-Have (Future)

### Advanced Testing
- Visual regression testing (Percy, Chromatic)
- Performance testing (Lighthouse CI)
- Load testing (k6, Artillery)
- Security scanning (Snyk, OWASP)

### Developer Tools
- Component library (Storybook)
- Design system documentation
- GraphQL API (Apollo)
- Database migrations (Drizzle)

### Observability
- Distributed tracing (OpenTelemetry)
- Real User Monitoring (RUM)
- Session replay (LogRocket)
- Feature flags (LaunchDarkly)

---

## 📝 Notes

**Current State**: Production-ready with excellent code quality  
**Priority Focus**: Testing and CI/CD infrastructure  
**Timeline**: 4 weeks for full implementation  
**Risk Level**: Low - all changes are additive  

**Conclusion**: The codebase is already in excellent condition. These cleanup tasks are primarily about adding safety nets (tests, CI/CD) and improving long-term maintainability. No breaking changes required.
