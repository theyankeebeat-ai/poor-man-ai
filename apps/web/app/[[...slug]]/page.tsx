import ClientApp from "./client";

export function generateStaticParams() {
  return [{ slug: [] as string[] }];
}

export default function Page() {
  return <ClientApp />;
}
