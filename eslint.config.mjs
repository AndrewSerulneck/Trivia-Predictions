import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      'design-system/**',
      'native/**',
    ],
  },
  ...nextVitals,
  // Next's TypeScript parser glob omits CJS declaration files. The shared Speed
  // comparison package uses .d.cts so both Node CJS and strict TS resolve it.
  {
    ...nextVitals.find(config => config.name === 'next/typescript'),
    files: ['lib/speed-trivia-uniqueness/**/*.d.cts'],
  },
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
