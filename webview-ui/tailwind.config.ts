import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(224 18% 8%)",
        foreground: "hsl(210 40% 98%)",
        card: "hsl(222 16% 12%)",
        "card-foreground": "hsl(210 40% 98%)",
        muted: "hsl(220 12% 18%)",
        "muted-foreground": "hsl(215 20% 72%)",
        border: "hsl(220 12% 22%)",
        primary: "hsl(210 100% 60%)",
        "primary-foreground": "hsl(220 16% 12%)",
        accent: "hsl(268 85% 68%)",
        "accent-foreground": "hsl(210 40% 98%)",
        ring: "hsl(210 100% 60%)",
      },
      borderRadius: {
        lg: "14px",
        md: "10px",
        sm: "8px",
      },
      boxShadow: {
        glow: "0 0 40px rgba(80, 200, 255, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;

