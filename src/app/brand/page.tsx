import tokens from "../../../brand/trilyt.tokens.json";
import { ICON_NAMES } from "@/lib/render/icons";
import { TEMPLATES } from "@/lib/schema";
import { color, gradient, semantic, slug } from "@/lib/brand";

export const dynamic = "force-dynamic";

const SEMANTIC_GROUPS = ["Text/", "Background/", "Border/"];

export default function BrandPage() {
  const semantics = Object.keys(tokens.color.semantic as Record<string, unknown>);
  const social = tokens.social;

  return (
    <>
      <div className="section" style={{ marginTop: 36 }}>
        <h1>Trilyt, as the slides use it.</h1>
        <p className="lede" style={{ marginTop: 10 }}>
          Pulled from the Figma file on {tokens.meta.source.extractedAt} and kept in <code>brand/trilyt.tokens.json</code>. The app,
          the slide renderer and this page all read that one file, so a change in Figma lands everywhere once it is re-synced.
        </p>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Slide templates</h2>
          <span className="muted">1080 × 1350, light palette, 88 px safe margin</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
          {TEMPLATES.map((template) => (
            <figure key={template} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/brand/template/${template}`}
                alt={`${template} template`}
                style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border-default)", display: "block" }}
              />
              <figcaption className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {template}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Colour</h2>
          <span className="muted">light mode values</span>
        </div>
        <div className="token-grid">
          <figure style={{ margin: 0, gridColumn: "span 2" }}>
            <div className="swatch" style={{ background: gradient.css }} />
            <figcaption style={{ marginTop: 6 }}>
              gradient-brand
              <div className="muted mono">
                {gradient.from} → {gradient.to}
              </div>
            </figcaption>
          </figure>
          {SEMANTIC_GROUPS.flatMap((group) =>
            semantics
              .filter((name) => name.startsWith(group))
              .slice(0, 8)
              .map((name) => (
                <figure key={name} style={{ margin: 0 }}>
                  <div className="swatch" style={{ background: semantic(name, "light") }} />
                  <figcaption style={{ marginTop: 6 }}>
                    {name}
                    <div className="muted mono">{semantic(name, "light")}</div>
                  </figcaption>
                </figure>
              )),
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Type on a slide</h2>
          <span className="muted">Manrope, auto-fitted between a maximum and a minimum</span>
        </div>
        <div className="panel">
          {Object.entries(social.type).map(([name, scale]) => (
            <div
              key={name}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr",
                gap: 16,
                alignItems: "baseline",
                padding: "10px 0",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span className="muted mono" style={{ fontSize: 12 }}>
                {name}
                <br />
                {scale.max}–{scale.min}px · {scale.weight}
              </span>
              <span
                style={{
                  fontSize: Math.min(38, scale.max / 3),
                  fontWeight: scale.weight,
                  letterSpacing: `${scale.letterSpacing}em`,
                  lineHeight: scale.lineHeight,
                }}
              >
                Where should a first-time surfer go?
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Icons</h2>
          <span className="muted">{ICON_NAMES.length} on a 24 px grid, 1.5 stroke</span>
        </div>
        <div className="icon-grid">
          {ICON_NAMES.map((name) => (
            <figure key={name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/brand/icon/${name}?size=28`} width={28} height={28} alt="" />
              {name}
            </figure>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Re-syncing from Figma</h2>
        </div>
        <div className="panel">
          <p style={{ marginTop: 0 }}>
            Figma&apos;s Variables REST API is Enterprise-only, so the tokens are read through the Figma MCP connection in a Claude
            session rather than fetched by this app. Ask Claude to “re-sync the Trilyt tokens from Figma” and it rewrites{" "}
            <code>brand/trilyt.tokens.json</code> and <code>brand/icons.json</code>; the diff in git is the review.
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            File: <code>{tokens.meta.source.fileKey}</code> · page “{tokens.meta.source.page}” · primitives{" "}
            {Object.keys(tokens.color.primitive).length}, semantic {semantics.length}, text styles{" "}
            {Object.keys(tokens.typography.textStyle).length}
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>CSS variables</h2>
          <span className="muted">every token, as the app uses it</span>
        </div>
        <div className="panel mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {["Text/Primary", "Text/Secondary", "Background/Page", "Background/Card", "Border/Default", "Orange/500", "Yellow/500"].map(
            (name) => (
              <div key={name}>
                --{slug(name)}: {color(name, "light")}
              </div>
            ),
          )}
          <div>--gradient-brand: {gradient.css}</div>
        </div>
      </div>
    </>
  );
}
