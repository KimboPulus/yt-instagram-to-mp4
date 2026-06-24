import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "A local-first queue for importing permitted videos and converting them to MP4.",
  title: "ClipForge Local",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                CF
              </span>
              <span>
                <strong>ClipForge</strong>
                <small>local video workshop</small>
              </span>
            </a>
            <div className="local-badge">
              <span className="status-dot" />
              Files stay on this machine
            </div>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <p>Built for personal, permission-based media workflows.</p>
            <p>Next.js + Fastify + local job queue + FFmpeg</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
