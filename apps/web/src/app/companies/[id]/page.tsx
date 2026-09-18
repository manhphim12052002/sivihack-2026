import { CompanyIntelligence } from "@/components/company-intelligence";
export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CompanyIntelligence companyId={(await params).id} />;
}
