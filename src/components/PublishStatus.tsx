"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Status {
  ready: boolean;
  missing: string[];
  accountId: string | null;
  host: string;
  version: string;
  publicBase: string | null;
  login: string;
  account: { id: string; username?: string; followers?: number; media?: number } | null;
  limit: { used: number; total: number | null } | null;
  error?: string | null;
}

interface SyncResult {
  updated: { id: string; metrics: number }[];
  matched: { id: string; mediaId: string }[];
  skipped: { id: string; why: string }[];
  followers?: number;
  error?: string;
}

/** The connection, and the button that pulls the week's numbers in. */
export function PublishStatus() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/instagram/status")
      .then((response) => response.json())
      .then((body) => live && setStatus(body as Status))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function sync() {
    setSyncing(true);
    setResult(null);
    try {
      const response = await fetch("/api/instagram/insights", { method: "POST" });
      setResult((await response.json()) as SyncResult);
      router.refresh();
    } catch {
      setResult({ updated: [], matched: [], skipped: [], error: "Could not reach Instagram" });
    } finally {
      setSyncing(false);
    }
  }

  if (!status) return <div className="panel muted">Checking the connection…</div>;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {status.ready ? (status.account ? `@${status.account.username ?? status.accountId}` : "Credentials set") : "Not connected"}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {status.ready
              ? `${status.host} · ${status.version} · ${status.login} login`
              : `Missing from .env.local: ${status.missing.join(", ")}`}
          </div>
        </div>
        <div className="row">
          {status.account ? (
            <>
              <span className="chip">
                <span className="chip__dot" aria-hidden />
                {(status.account.followers ?? 0).toLocaleString("en-IN")} followers
              </span>
              {status.limit ? (
                <span className="chip">
                  <span className="chip__dot" aria-hidden />
                  {status.limit.used}
                  {status.limit.total ? `/${status.limit.total}` : ""} posts today
                </span>
              ) : null}
            </>
          ) : null}
          <button className="btn btn--small" onClick={() => void sync()} disabled={!status.ready || syncing}>
            {syncing ? "Syncing…" : "Sync insights"}
          </button>
        </div>
      </div>

      {status.error ? (
        <div className="issue issue--error" style={{ marginTop: 14 }}>
          {status.error}
        </div>
      ) : null}

      {!status.publicBase && status.ready ? (
        <div className="issue issue--warning" style={{ marginTop: 14 }}>
          PUBLIC_MEDIA_BASE_URL is empty. Instagram fetches the media rather than taking an upload, so publishing needs this app
          reachable at an https address.
        </div>
      ) : null}

      {result ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 14 }}>
          {result.error ? (
            <span style={{ color: "var(--text-error)" }}>{result.error}</span>
          ) : (
            <>
              {result.followers !== undefined ? `Followers now ${result.followers.toLocaleString("en-IN")}. ` : ""}
              {result.updated.length} post{result.updated.length === 1 ? "" : "s"} updated
              {result.matched.length ? `, ${result.matched.length} matched by permalink` : ""}
              {result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
