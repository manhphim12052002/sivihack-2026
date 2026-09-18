export class CompanyError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 422,
  ) {
    super(message);
    this.name = "CompanyError";
  }
}
export function companyErrorResponse(error: unknown, companyId?: string) {
  const e =
    error instanceof CompanyError
      ? error
      : new CompanyError(
          "INGESTION_FAILED",
          error instanceof Error ? error.message : "Company operation failed",
          500,
        );
  return Response.json(
    { error: e.message, code: e.code, company_id: companyId },
    { status: e.httpStatus },
  );
}
