// Next.js 16 App Router — typed page/layout props.
// The route string is a phantom tag; the actual shape is what Next.js requires.

type LayoutProps<_Route extends string = string> = {
  children: React.ReactNode;
  params?: Promise<Record<string, string>>;
};

type PageProps<_Route extends string = string> = {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
