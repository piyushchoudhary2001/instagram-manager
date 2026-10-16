import type { Metadata } from "next";
import { cssVariables } from "@/lib/brand";
import { readConfig } from "@/lib/store";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content manager",
  description: "Draft, review and approve Instagram posts for build.it01.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await readConfig().catch(() => null);
  return (
    <html lang="en">
      <head>
        {/* Trilyt tokens, straight from brand/trilyt.tokens.json */}
        <style dangerouslySetInnerHTML={{ __html: cssVariables("light") }} />
      </head>
      <body>
        <header className="topbar">
          <span className="topbar__mark">
            <span className="topbar__dot" aria-hidden />
            Content manager
          </span>
          <Nav />
          <span className="topbar__right">
            <span>{config?.handle ?? "content/config.json missing"}</span>
          </span>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
