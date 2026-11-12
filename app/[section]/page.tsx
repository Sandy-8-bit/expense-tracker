import { notFound } from 'next/navigation';
import Workspace from '@/src/features/workspace';
import { workspacePages } from '@/src/lib/pages';
import { Suspense } from 'react';
export default function SectionPage(props: { params: Promise<{ section: string }> }) {
  return (
    <Suspense fallback={<main className="setup">Loading workspace…</main>}>
      <SectionContent {...props} />
    </Suspense>
  );
}
async function SectionContent({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const title = workspacePages[section];
  if (!title) notFound();
  return <Workspace initialPage={title} />;
}
