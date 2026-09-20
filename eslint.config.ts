import antfu from '@antfu/eslint-config'

export default antfu({
  vue: false,
  typescript: true,
  rules: {
    'no-console': 'off',
  },
  ignores: [
    '**/node_modules/**',
    'template-*',
    '**/dist/**',
    '.docs/**',
    '.superpowers/**',
  ],
})
