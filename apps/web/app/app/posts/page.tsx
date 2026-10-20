import { redirect } from 'next/navigation';

// The post list became the calendar's list view, as in the prototype.
export default async function Posts({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  redirect(`/app/calendar?view=list${created ? '&created=1' : ''}`);
}
