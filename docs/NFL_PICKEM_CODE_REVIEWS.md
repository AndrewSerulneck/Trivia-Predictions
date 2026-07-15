# NFL Pick 'Em - Code Review Checklist

This document provides comprehensive code review criteria for each phase of NFL Pick 'Em implementation.

## Review Process

1. **Self-Review**: Developer reviews their own code against this checklist
2. **Peer Review**: Another developer reviews and signs off
3. **AI Review**: Run through AI assistant for additional insights
4. **Final Approval**: Tech lead approves before merge

## Phase 2: Database Reviews

### Migration Review Checklist

```markdown
## Migration: 20260715000000_add_nfl_pickem_weeks.sql

### Schema Design
- [ ] Table names follow convention (nfl_pickem_*)
- [ ] Column names use snake_case
- [ ] Primary keys use uuid with default gen_random_uuid()
- [ ] Foreign keys properly reference parent tables
- [ ] ON DELETE behavior specified (CASCADE where appropriate)

### Constraints
- [ ] CHECK constraints validate data integrity
- [ ] UNIQUE constraints prevent duplicates
- [ ] NOT NULL on required fields
- [ ] Default values specified where appropriate

### Indexes
- [ ] Primary key automatically indexed
- [ ] Foreign keys indexed for JOIN performance
- [ ] Query patterns covered by indexes
- [ ] No redundant indexes

### RLS Policies
- [ ] Policies follow least-privilege principle
- [ ] SELECT policies restrict to authorized users
- [ ] INSERT/UPDATE policies validate ownership
- [ ] Service role has necessary access

### Triggers
- [ ] updated_at trigger uses set_updated_at() function
- [ ] Triggers don't create infinite loops
- [ ] No performance-heavy operations in triggers

### Verification Queries
```sql
-- Run these to verify migration
\dt nfl_pickem_*                    -- Tables exist
\di idx_nfl_*                       -- Indexes exist
SELECT * FROM pg_policies WHERE tablename LIKE 'nfl_pickem%';
SELECT proname FROM pg_proc WHERE proname LIKE '%nfl%';
```
```

## Phase 3: Backend Reviews

### Library Code Review (lib/nflPickEm.ts)

```markdown
## File: lib/nflPickEm.ts

### TypeScript Quality
- [ ] All functions have explicit return types
- [ ] No `any` types used (or justified with comment)
- [ ] Complex types exported for reuse
- [ ] JSDoc comments on public functions

### Error Handling
- [ ] All async operations wrapped in try/catch
- [ ] Errors include context (function name, parameters)
- [ ] User-facing errors are sanitized
- [ ] Database errors don't leak internal details

### Performance
- [ ] Database queries use indexes
- [ ] No N+1 query patterns
- [ ] Batch operations where possible
- [ ] Caching considered for expensive operations

### Security
- [ ] User input validated before use
- [ ] SQL injection impossible (parameterized queries)
- [ ] RLS policies enforced
- [ ] No sensitive data logged

### Testing
- [ ] Unit tests for calculation functions
- [ ] Mock external API calls
- [ ] Edge cases covered (null, empty, boundary)
```

### API Route Review

```markdown
## File: app/api/nfl-pickem/*/route.ts

### API Design
- [ ] RESTful URL structure
- [ ] Consistent response format { ok: boolean, ... }
- [ ] Appropriate HTTP status codes
- [ ] Error messages are user-friendly

### Input Validation
- [ ] Required parameters checked
- [ ] Parameter types validated
- [ ] SQL injection prevention
- [ ] XSS prevention on output

### Authentication
- [ ] Protected routes check auth
- [ ] User can only access own data
- [ ] Rate limiting considered

### Performance
- [ ] Response time < 500ms target
- [ ] Proper caching headers
- [ ] No blocking operations
```

## Phase 4: Frontend Reviews

### Component Review

```markdown
## File: components/nfl-pickem/*.tsx

### React Best Practices
- [ ] Functional components with hooks
- [ ] Props properly typed (no implicit any)
- [ ] useEffect dependencies correct
- [ ] No memory leaks (cleanup functions)
- [ ] Keys provided for list items

### State Management
- [ ] useState for local component state
- [ ] useCallback for event handlers
- [ ] useMemo for expensive calculations
- [ ] Optimistic updates implemented
- [ ] Error states handled

### API Integration
- [ ] Loading states implemented
- [ ] Error handling with user feedback
- [ ] Request cancellation on unmount
- [ ] No duplicate requests

### Accessibility
- [ ] Semantic HTML elements
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Color contrast sufficient
- [ ] Screen reader compatible

### Styling
- [ ] Tailwind classes follow project conventions
- [ ] Responsive design (mobile-first)
- [ ] Consistent with existing UI
- [ ] No inline styles (use Tailwind)
- [ ] Dark mode support (if applicable)

### Performance
- [ ] No unnecessary re-renders
- [ ] Images optimized
- [ ] Lazy loading for below-fold content
- [ ] Bundle size impact minimal
```

## Phase 5: Logic Reviews

### Algorithm Review

```markdown
## Logic: Week Calculation & Lock Mechanism

### Correctness
- [ ] Algorithm handles all edge cases
- [ ] Time zone handling correct (UTC)
- [ ] Leap year handling correct
- [ ] DST transitions handled

### Performance
- [ ] O(1) or O(n) complexity
- [ ] No unnecessary iterations
- [ ] Memoization where appropriate

### Testability
- [ ] Pure functions where possible
- [ ] No hidden dependencies
- [ ] Test cases cover edge cases
```

## General Code Quality

### Code Style
- [ ] Follows project ESLint/Prettier config
- [ ] Consistent naming conventions
- [ ] No commented-out code
- [ ] No console.log in production code
- [ ] Meaningful variable names

### Documentation
- [ ] README updated if needed
- [ ] API endpoints documented
- [ ] Complex logic has comments
- [ ] Type definitions documented

### Security
- [ ] No secrets in code
- [ ] Environment variables used
- [ ] Input sanitization
- [ ] Output encoding

## Review Sign-Off Template

```markdown
## Code Review Sign-Off

**Phase**: [2/3/4/5]
**Reviewer**: [Name]
**Date**: [YYYY-MM-DD]

### Checklist Summary
- [ ] All items in Phase [X] checklist reviewed
- [ ] No critical issues found
- [ ] Minor issues documented below
- [ ] Tests pass

### Issues Found
| Severity | Issue | Resolution |
|----------|-------|------------|
| [High/Med/Low] | [Description] | [Fixed/Deferred] |

### Approval
- [ ] Approved for merge
- [ ] Approved with changes
- [ ] Requires re-review

**Reviewer Signature**: _______________
```

## Common Issues to Watch For

### Database
1. **Missing indexes** - Will cause slow queries at scale
2. **No RLS policies** - Security vulnerability
3. **No constraints** - Data integrity issues
4. **Missing ON DELETE** - Orphaned records

### Backend
1. **No input validation** - Security risk
2. **Exposed stack traces** - Information leak
3. **No error handling** - Crashes
4. **N+1 queries** - Performance killer

### Frontend
1. **Missing loading states** - Poor UX
2. **No error handling** - Silent failures
3. **Memory leaks** - useEffect without cleanup
4. **Accessibility issues** - WCAG violations

## AI Review Prompts

Use these prompts with AI assistants for additional review:

### Database Review Prompt
```
Review this PostgreSQL migration for:
1. Data integrity (constraints, foreign keys)
2. Performance (indexes, query patterns)
3. Security (RLS policies)
4. Best practices (naming, structure)

[MIGRATION SQL HERE]
```

### Code Review Prompt
```
Review this TypeScript code for:
1. Type safety (no implicit any)
2. Error handling
3. Performance optimizations
4. Security concerns
5. Best practices

[CODE HERE]
```

### API Review Prompt
```
Review this API endpoint for:
1. RESTful design
2. Input validation
3. Error handling
4. Performance
5. Security

[CODE HERE]
```

## Review Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code style and potential bugs |
| TypeScript Compiler | Type checking |
| Vitest | Unit test execution |
| Playwright | E2E test execution |
| Vercel Preview | Visual review |
| Supabase Dashboard | Database review |

## Final Pre-Merge Checklist

- [ ] All phase checklists completed
- [ ] All tests pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Version bumped (if applicable)
- [ ] Migration tested
- [ ] Rollback tested

---

Use this document throughout implementation to ensure consistent, high-quality code.
