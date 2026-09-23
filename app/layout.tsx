import type { Metadata } from "next";
import "./globals.css";

/* --------------------------------------------------------------------------
   Metadata — Next.js App Router static metadata object.
   Used for <title>, <meta name="description">, and OG tags.
   -------------------------------------------------------------------------- */
export const metadata: Metadata = {
  title: {
    default: "parkmitra — find and book city parking",
    template: "%s · parkmitra",
  },
  description:
    "Search available parking bays near you, choose your window, and confirm in three taps. No account required.",
  applicationName: "parkmitra",
};

/* --------------------------------------------------------------------------
   RootLayout — App Router root layout.
   All pages render inside the <main> slot via {children}.
   -------------------------------------------------------------------------- */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {/* ----------------------------------------------------------------
            Site header — sticky, holds the wordmark.
            Uses .site-header classes defined in globals.css.
            --------------------------------------------------------------- */}
        <header className="site-header">
          <div className="site-header__inner">
            {/* The wordmark is a home-link at every screen size */}
            <a href="/" className="site-header__wordmark" aria-label="parkmitra home">
              parkmitra
            </a>
          </div>
        </header>

        {/* ----------------------------------------------------------------
            Page content — each route segment renders here.
            Wrap in a landmark so screen readers can skip to main directly.
            --------------------------------------------------------------- */}
        <main>{children}</main>
      </body>
    </html>
  );
}
