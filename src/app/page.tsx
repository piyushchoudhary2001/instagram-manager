import Link from "next/link";
import { PostCard, thumbFor } from "@/components/PostCard";
import { StatusChip } from "@/components/StatusChip";
import { reconcileAll } from "@/lib/approval";
import { labelDay, labelRange, todayIn, weeksOf } from "@/lib/dates";
import { readiness } from "@/lib/status";
import { listPosts, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const config = await readConfig();
  const { posts, issues } = await listPosts();
  const stored = await reconcileAll(posts);
  const all = stored.map((s) => s.post);
  const today = todayIn(config.timezone);

  const planStart = config.plan?.start ?? today;
  const weeks = weeksOf(planStart, config.plan?.weeks ?? 3);
  const themes = config.plan?.weekThemes ?? [];

  const scheduled = all.filter((p) => p.date);
  const unscheduled = all.filter((p) => !p.date && p.status !== "archived");
  const waiting = all.filter((p) => p.status === "in_review");
  const ready = all.filter((p) => p.status === "approved" || p.status === "scheduled");
  const posted = all.filter((p) => p.status === "posted");

  const goal = config.goal;
  const progress = goal ? Math.min(100, Math.round((goal.current / goal.followers) * 100)) : 0;

  return (
    <>
      <div className="section" style={{ marginTop: 36 }}>
        <h1>Three weeks, fifteen posts.</h1>
        <p className="lede" style={{ marginTop: 10 }}>
          Claude drafts into <code>content/posts</code>; you approve here. Nothing is marked approved or posted unless you do
          it yourself.
        </p>
      </div>

      {goal ? (
        <div className="goal" style={{ marginTop: 24 }}>
          <div className="goal__cell">
            <div className="goal__value mono">{goal.current.toLocaleString("en-IN")}</div>
            <div className="goal__label">Followers on {goal.currentAsOf ?? "the last count"}</div>
            <div className="bar">
              <div className="bar__fill" style={{ width: `${Math.max(2, progress)}%` }} />
            </div>
          </div>
          <div className="goal__cell">
            <div className="goal__value mono">{goal.followers.toLocaleString("en-IN")}</div>
            <div className="goal__label">{goal.label ?? "Target"}</div>
          </div>
          <div className="goal__cell">
            <div className="goal__value mono">{waiting.length}</div>
            <div className="goal__label">Waiting for your review</div>
          </div>
          <div className="goal__cell">
            <div className="goal__value mono">
              {posted.length}
              <span className="muted" style={{ fontSize: 18 }}>
                /{all.length}
              </span>
            </div>
            <div className="goal__label">Posted so far</div>
          </div>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="section">
          <div className="section__head">
            <h2>Files that would not load</h2>
          </div>
          <div className="queue">
            {issues.map((issue) => (
              <div key={issue.file} className="issue issue--error">
                <strong>{issue.file}</strong>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {waiting.length > 0 ? (
        <div className="section">
          <div className="section__head">
            <h2>Needs your review</h2>
            <Link className="muted" href="/review">
              Open the review queue →
            </Link>
          </div>
          <div className="queue">
            {waiting.map((post) => {
              const review = readiness(post, config);
              const thumb = thumbFor(post);
              return (
                <Link key={post.id} className="queue__item" href={`/posts/${post.id}`}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="queue__thumb" src={thumb} alt="" loading="lazy" />
                  ) : (
                    <span className="queue__thumb" aria-hidden />
                  )}
                  <span>
                    <strong style={{ fontSize: 15 }}>{post.title}</strong>
                    <span className="card__meta">
                      {post.date ? labelDay(post.date) : "No date"} · {post.format} ·{" "}
                      {review.errors.length > 0
                        ? `${review.errors.length} thing${review.errors.length === 1 ? "" : "s"} to fix first`
                        : review.warnings.length > 0
                          ? `${review.warnings.length} note${review.warnings.length === 1 ? "" : "s"}`
                          : "Ready to approve"}
                    </span>
                  </span>
                  <StatusChip status={post.status} />
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>Calendar</h2>
          <span className="muted">
            {ready.length} approved · {scheduled.length} dated · posting at {config.defaultTime} IST
          </span>
        </div>
        <div className="weeks">
          {weeks.map((week, i) => (
            <section className="week" key={week.start}>
              <div className="week__meta">
                <div className="week__name">Week {i + 1}</div>
                <div className="week__dates">{labelRange(week.start, week.end)}</div>
                {themes[i] ? <div className="week__theme">{themes[i]}</div> : null}
              </div>
              <div className="days">
                {week.days.map((day) => {
                  const dayPosts = all.filter((p) => p.date === day);
                  return (
                    <div
                      key={day}
                      className={`day${dayPosts.length === 0 ? " day--off" : ""}${day === today ? " day--today" : ""}`}
                    >
                      <div className="day__label">
                        <span>{labelDay(day)}</span>
                        {day === today ? <span style={{ color: "var(--orange-600)" }}>today</span> : null}
                      </div>
                      {dayPosts.map((post) => (
                        <PostCard key={post.id} post={post} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {unscheduled.length > 0 ? (
        <div className="section">
          <div className="section__head">
            <h2>Not on the calendar yet</h2>
          </div>
          <div className="queue">
            {unscheduled.map((post) => (
              <Link key={post.id} className="queue__item" href={`/posts/${post.id}`}>
                <span className="queue__thumb" aria-hidden />
                <span>
                  <strong style={{ fontSize: 15 }}>{post.title}</strong>
                  <span className="card__meta">{post.pillar}</span>
                </span>
                <StatusChip status={post.status} />
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
