import "./globals.css";

export const metadata = {
  title: "Prop Desk — NBA prop analysis",
  description: "Empirical hit rates, Kelly sizing, parlays up to 10 legs. Real math, no hype.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
