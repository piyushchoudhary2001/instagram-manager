import { notFound } from "next/navigation";
import { PostEditor } from "@/components/PostEditor";
import { reconcileApproval } from "@/lib/approval";
import { ICON_NAMES } from "@/lib/render/icons";
import { NotFoundError, getPost, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await readConfig();
  try {
    const stored = await reconcileApproval(await getPost(id));
    return <PostEditor initialPost={stored.post} initialEtag={stored.etag} config={config} iconNames={ICON_NAMES} />;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
