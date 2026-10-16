import Link from "next/link";
import type { Post } from "@/lib/schema";
import { label12h } from "@/lib/dates";
import { StatusChip } from "./StatusChip";

export function thumbFor(post: Post): string | null {
  if (post.slides.length > 0) return `/api/posts/${post.id}/preview/0`;
  if (post.reel?.cover) return `/api/posts/${post.id}/preview/0?cover=1`;
  return null;
}

const FORMAT_LABEL: Record<string, string> = { carousel: "Carousel", reel: "Reel", story: "Story", single: "Post" };

export function PostCard({ post }: { post: Post }) {
  const thumb = thumbFor(post);
  return (
    <Link className={`card${thumb ? "" : " card--empty"}`} href={`/posts/${post.id}`}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="card__thumb" src={thumb} alt="" loading="lazy" />
      ) : (
        <span className="card__thumb" aria-hidden />
      )}
      <span className="card__body">
        <span className="card__title">{post.title}</span>
        <span className="card__meta">
          <StatusChip status={post.status} />
        </span>
        <span className="card__meta mono">
          {FORMAT_LABEL[post.format] ?? post.format}
          {post.time ? ` · ${label12h(post.time)}` : ""}
        </span>
      </span>
    </Link>
  );
}
