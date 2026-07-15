# NFL Pick 'Em - Master Implementation Plan

## Overview
This document serves as the central hub for implementing NFL Pick 'Em. It links to detailed phase-specific documents and provides high-level guidance.

## Project Context

### Existing Architecture References
- **Pick 'Em Core**: [`lib/pickem.ts`](lib/pickem.ts:1) - 2573 lines of battle-tested pick logic
- **UI Component**: [`components/pickem/PickEmGameList.tsx`](components/pickem/PickEmGameList.tsx:1) - Main game interface
- **Database**: [`supabase/migrations/20260427113000_add_pickem_tables.sql`](supabase/migrations/20260427113000_add_pickem_tables.sql:1) - pickem_picks schema
- **API Routes**: [`app/api/pickem/`](app/api/pickem/) - Existing endpoints
- **Game Cards**: [`lib/venueGameCards.ts`](lib/venueGameCards.ts:1) - Venue hub integration
- **NFL API Docs**: [`BDL-API docs/NFL API .html`](BDL-API%20docs/NFL%20API%20.html:1) - balldontlie documentation

### Key Existing Patterns to Follow
1. **Server-side data fetching** with `import "server-only"`
2. **BallDontLie integration** via `fetchBallDontLieList()` helper
3. **Optimistic UI updates** in React components
4. **Supabase RLS policies** for user data protection
5. **Cron job pattern** at `/api/cron/pickem-settle/route.ts`

## Document Index

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [`NFL_PICKEM_PHASE1_ARCHITECTURE.md`](docs/NFL_PICKEM_PHASE1_ARCHITECTURE.md) | Requirements, architecture decisions, tech stack | Before starting |
| [`NFL_PICKEM_PHASE2_DATABASE.md`](docs/NFL_PICKEM_PHASE2_DATABASE.md) | Complete SQL migrations, schema design, RLS policies | Phase 2 |
| [`NFL_PICKEM_PHASE3_BACKEND.md`](docs/NFL_PICKEM_PHASE3_BACKEND.md) | API routes, library functions, cron jobs | Phase 3 |
| [`NFL_PICKEM_PHASE4_FRONTEND.md`](docs/NFL_PICKEM_PHASE4_FRONTEND.md) | React components, hooks, styling | Phase 4 |
| [`NFL_PICKEM_PHASE5_LOGIC.md`](docs/NFL_PICKEM_PHASE5_LOGIC.md) | Week calculation, lock mechanism, grading | Phase 5 |
| [`NFL_PICKEM_PHASE6_TESTING.md`](docs/NFL_PICKEM_PHASE6_TESTING.md) | Test plans, edge cases, QA checklist | Phase 6 |
| [`NFL_PICKEM_PHASE7_DEPLOYMENT.md`](docs/NFL_PICKEM_PHASE7_DEPLOYMENT.md) | Deployment steps, monitoring, rollback | Phase 7 |
| [`NFL_PICKEM_CODE_REVIEWS.md`](docs/NFL_PICKEM_CODE_REVIEWS.md) | Code review checklist for each phase | All phases |

## AI Model Recommendations by Phase

### Phase 1: Architecture (2 days)
**Recommended Model**: Claude (Architect mode)
- Best for system design and trade-off analysis
- Can reason about integration with existing codebase

### Phase 2: Database Schema (1 day)
**Recommended Model**: Claude or Roo (Code mode)
- SQL generation and migration scripting
- Schema validation against existing tables

### Phase 3: Backend API (3 days)
**Recommended Model**: Roo (Code mode) with CodeReview capability
- TypeScript implementation
- API integration patterns
- Error handling

### Phase 4: Frontend (4 days)
**Recommended Model**: Roo (Code mode) + Vision capability
- React component development
- Tailwind CSS styling
- Framer Motion animations

### Phase 5: Logic Implementation (2 days)
**Recommended Model**: Claude or Roo (Debug mode)
- Date/time calculations
- Edge case handling
- Lock mechanism testing

### Phase 6: Testing (3 days)
**Recommended Model**: Roo (Debug mode)
- Test case generation
- Debugging failed tests
- Performance profiling

### Phase 7: Deployment (1 day)
**Recommended Model**: Roo (Code mode)
- Infrastructure as code
- Monitoring setup
- Documentation

## Implementation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  START: Read Master Plan & Phase 1 Architecture            │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Database (1 day)                                  │
│  ├── Read: NFL_PICKEM_PHASE2_DATABASE.md                   │
│  ├── Create migrations                                      │
│  ├── Run: supabase migration up                             │
│  └── Review: Check schema in Supabase dashboard            │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Backend API (3 days)                              │
│  ├── Read: NFL_PICKEM_PHASE3_BACKEND.md                    │
│  ├── Implement lib/nflPickEm.ts                            │
│  ├── Create API routes                                      │
│  ├── Test with curl/Postman                                 │
│  └── Review: Use NFL_PICKEM_CODE_REVIEWS.md                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Frontend (4 days)                                 │
│  ├── Read: NFL_PICKEM_PHASE4_FRONTEND.md                   │
│  ├── Create components                                      │
│  ├── Implement page.tsx                                     │
│  ├── Test in browser                                        │
│  └── Review: Use NFL_PICKEM_CODE_REVIEWS.md                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 5: Logic & Lock (2 days)                             │
│  ├── Read: NFL_PICKEM_PHASE5_LOGIC.md                      │
│  ├── Implement week calculations                            │
│  ├── Add lock mechanism                                     │
│  ├── Test lock timing                                       │
│  └── Review: Use NFL_PICKEM_CODE_REVIEWS.md                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 6: Testing (3 days)                                  │
│  ├── Read: NFL_PICKEM_PHASE6_TESTING.md                    │
│  ├── Write unit tests                                       │
│  ├── Manual testing checklist                               │
│  ├── Fix bugs                                               │
│  └── Performance testing                                    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 7: Deployment (1 day)                                │
│  ├── Read: NFL_PICKEM_PHASE7_DEPLOYMENT.md                 │
│  ├── Production migrations                                  │
│  ├── Deploy to Vercel                                       │
│  ├── Configure cron jobs                                    │
│  └── Setup monitoring                                       │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  COMPLETE: NFL Pick 'Em Live in Production                 │
└─────────────────────────────────────────────────────────────┘
```

## Critical Path Items

These items must be completed in order and block subsequent phases:

1. **Phase 2 Complete** → Database must be ready before backend can query it
2. **Phase 3 Complete** → API must be functional before frontend can consume it
3. **Phase 5 Complete** → Lock logic must work before testing grading
4. **Phase 6 Complete** → All tests must pass before deployment

## Risk Mitigation

| Risk | Mitigation | Owner |
|------|------------|-------|
| balldontlie API changes | Abstract API calls in lib/nflPickEm.ts | Backend dev |
| NFL schedule changes | Sync job runs weekly to update weeks | Cron job |
| Lock time calculation wrong | Test with known TNF kickoff times | QA |
| Performance at scale | Add indexes, test with 1000+ users | Backend dev |
| User confusion on lock | Add prominent countdown timer | Frontend dev |

## Success Metrics

- [ ] All 18 NFL weeks sync correctly
- [ ] Picks lock at correct Thursday time
- [ ] Users can view previous week results
- [ ] Auto-grading works within 5 minutes of game end
- [ ] Points awarded correctly
- [ ] < 500ms API response time
- [ ] Zero data loss during deployment

## Communication Plan

- **Daily standups**: Check blockers
- **Phase completions**: Update todo list in AI chat
- **Code reviews**: Use NFL_PICKEM_CODE_REVIEWS.md checklist
- **Deploy approval**: All tests must pass

---

**Next Step**: Read [`NFL_PICKEM_PHASE1_ARCHITECTURE.md`](docs/NFL_PICKEM_PHASE1_ARCHITECTURE.md) to begin Phase 1.
