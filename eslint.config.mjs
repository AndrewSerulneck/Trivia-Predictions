import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      'design-system/**',
      'native/**',
      'tmp/**',
      '.claude/worktrees/**',
    ],
  },
  ...nextVitals,
  // Next's TypeScript parser glob omits CJS declaration files. The shared Speed
  // comparison package uses .d.cts so both Node CJS and strict TS resolve it;
  // the private writer's .mjs helpers get .d.mts types the same way (Phase 7h).
  {
    ...nextVitals.find(config => config.name === 'next/typescript'),
    files: ['lib/speed-trivia-uniqueness/**/*.d.cts', 'lib/question-variety/**/*.d.cts', 'lib/question-writer/**/*.d.cts', 'lib/live-trivia-quality/**/*.d.cts', 'lib/openai/**/*.d.cts', 'tools/question-writer/*.d.mts'],
  },
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
