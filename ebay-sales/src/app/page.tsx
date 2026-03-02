import { redirect } from 'next/navigation';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  if (params.code) {
    redirect(`/oauth?${new URLSearchParams(params as Record<string, string>).toString()}`);
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-xl font-semibold">eBay Sales Intake API</h1>
      <p className="mt-2 text-gray-600">
        Use the ebay-sales-ui frontend or call API routes directly.
      </p>
    </main>
  );
}
