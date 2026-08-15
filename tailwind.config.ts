import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				foreground: 'hsl(var(--warning-foreground))'
  			},
			brand: 'hsl(var(--brand))',
			'brand-gradient': {
				from: '#7EB8F7',
				to: '#4A90D9'
			}
		},
		backgroundImage: {
			'brand-gradient': 'linear-gradient(135deg, #7EB8F7, #4A90D9)',
			'brand-gradient-hover': 'linear-gradient(135deg, #94C8FF, #5AA0EB)'
		},
  		borderRadius: {
			/* Unified radius scale — canonical = 8px for ALL bordered elements
			   (buttons, cards, inputs, modals, popovers, widgets).
			   Pills/avatars use rounded-full. Tiny chips may use rounded-sm (4px). */
			'3xl': '8px',
			'2xl': '8px',
			xl: '8px',
			lg: '8px',
			md: '8px',
			sm: '4px',
			DEFAULT: '8px'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'fade-in': {
  				from: { opacity: '0', transform: 'translateY(10px)' },
  				to: { opacity: '1', transform: 'translateY(0)' }
  			},
  			'slide-in': {
  				from: { opacity: '0', transform: 'translateX(-10px)' },
  				to: { opacity: '1', transform: 'translateX(0)' }
  			},
  			'scale-in': {
  				from: { opacity: '0', transform: 'scale(0.95)' },
  				to: { opacity: '1', transform: 'scale(1)' }
  			},
  			'pulse-subtle': {
  				'0%, 100%': { opacity: '1' },
  				'50%': { opacity: '0.85' }
  			},
  			'slide-in-from-right': {
  				from: { opacity: '0', transform: 'translateX(30px)' },
  				to: { opacity: '1', transform: 'translateX(0)' }
  			},
			'slide-in-from-left': {
				from: { opacity: '0', transform: 'translateX(-30px)' },
				to: { opacity: '1', transform: 'translateX(0)' }
			},
			'shimmer': {
				'0%': { transform: 'translate(-100%, -100%)' },
				'60%': { transform: 'translate(100%, 100%)' },
				'100%': { transform: 'translate(100%, 100%)' }
			},
			'shimmer-sweep': {
				'0%': { transform: 'translateX(-100%)' },
				'100%': { transform: 'translateX(100%)' }
			},
			'pulse-highlight': {
				'0%, 100%': { boxShadow: '0 0 0 0 transparent' },
				'50%': { boxShadow: '0 0 0 4px hsl(var(--warning) / 0.3)' }
			},
			'glow-pulse': {
				'0%, 100%': { boxShadow: '0 0 8px rgba(126,184,247,0.2)' },
				'50%': { boxShadow: '0 0 20px rgba(126,184,247,0.4)' }
			},
			'mapping-flash': {
				'0%': { backgroundColor: 'hsl(142 76% 36% / 0.25)' },
				'100%': { backgroundColor: 'transparent' }
			},
			'slideInFromRight': {
				from: { opacity: '0', transform: 'translateX(60px)' },
				to: { opacity: '1', transform: 'translateX(0)' }
			},
			'slideInFromLeft': {
				from: { opacity: '0', transform: 'translateX(-60px)' },
				to: { opacity: '1', transform: 'translateX(0)' }
			},
			'task-complete-pop': {
				'0%': { transform: 'scale(1)' },
				'40%': { transform: 'scale(1.25)' },
				'100%': { transform: 'scale(1)' }
			},
			'task-check-draw': {
				from: { strokeDashoffset: '12' },
				to: { strokeDashoffset: '0' }
			},
			'task-row-settle': {
				from: { opacity: '1', transform: 'translateX(0)' },
				to: { opacity: '0.7', transform: 'translateX(0)' }
			},
			'kb-progress': {
				'0%': { transform: 'translateX(-100%)' },
				'100%': { transform: 'translateX(400%)' }
			}
		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.5s ease-out',
  			'slide-in': 'slide-in 0.3s ease-out',
  			'scale-in': 'scale-in 0.2s ease-out',
  			'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
  			'slide-in-from-right': 'slide-in-from-right 0.25s ease-out',
  			'slide-in-from-left': 'slide-in-from-left 0.25s ease-out',
  			'pulse-highlight': 'pulse-highlight 1.5s ease-in-out 2',
			'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
			'mapping-flash': 'mapping-flash 600ms ease-out forwards',
			'task-complete-pop': 'task-complete-pop 300ms ease-out',
			'task-check-draw': 'task-check-draw 250ms ease-out forwards',
			'task-row-settle': 'task-row-settle 400ms ease-out forwards'
			,
			'shimmer-sweep': 'shimmer-sweep 1.8s ease-in-out infinite'
			,
			'kb-progress': 'kb-progress 1.4s ease-in-out infinite'
  		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)',
			'glass': '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
			'glass-hover': '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
			'accent-glow': '0 0 16px rgba(126,184,247,0.15)',
			'accent-glow-strong': '0 0 24px rgba(126,184,247,0.25)',
			'focus-accent': '0 0 0 2px rgba(126,184,247,0.4)'
  		},
  		fontFamily: {
  			sans: [
  				'Figtree',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			mono: [
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			],
  			serif: [
  				'Playfair Display',
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			]
  		},
  		fontSize: {
  			display: ['2rem', { lineHeight: '1.2', fontWeight: '600' }],
  			heading: ['1.5rem', { lineHeight: '1.2', fontWeight: '600' }],
  			subheading: ['1.125rem', { lineHeight: '1.4', fontWeight: '500' }]
  		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/container-queries")],
} satisfies Config;
