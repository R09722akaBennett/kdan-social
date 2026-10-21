import { requireUser } from '@/lib/auth';
import { Tour } from './tour';

export default async function TourPage() {
  await requireUser();
  return <Tour />;
}
