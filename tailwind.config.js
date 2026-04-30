export default {
  darkMode: 'class',
  content: ['./index.html', './client/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#18212f',
        panel: '#f7f9fb',
        line: '#d8e0e8',
        ocean: '#0f766e',
        signal: '#b45309'
      },
      boxShadow: {
        soft: '0 12px 30px rgba(24, 33, 47, 0.08)'
      }
    }
  },
  plugins: []
};
