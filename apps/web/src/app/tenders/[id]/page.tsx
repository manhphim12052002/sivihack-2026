import { TenderReviewClient } from "@/components/tender-review-client";

/** Thin server wrapper: resolves the dynamic route + query params, then hands off to the client component that fetches and renders the review. */
export default async function TenderBriefingPage({ params, searchParams }: PageProps<"/tenders/[id]">) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const companyParam = resolvedSearchParams.company;
  const companyId = Array.isArray(companyParam) ? companyParam[0] : companyParam;

  // Next 16 leaves this page's `params.id` percent-encoded (unlike route handlers, which
  // decode it) — lot_key values always contain "|", so every tender 404'd until decoded here.
  return <TenderReviewClient tenderId={decodeURIComponent(id)} companyId={companyId} />;
}
