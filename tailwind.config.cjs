/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                agentos: {
                    blue: {
                        light: '#f8fafc',
                        DEFAULT: '#2563eb',
                        dark: '#1e40af',
                    },
                    slate: {
                        50: '#f8fafc',
                        100: '#f1f5f9',
                        200: '#e2e8f0',
                        300: '#cbd5e1',
                        400: '#94a3b8',
                        500: '#64748b',
                        600: '#475569',
                        700: '#334155',
                        800: '#1e293b',
                        900: '#0f172a',
                    }
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Outfit', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
