import FetchPatch from "./fetchPatch";

export const metadata = {
  title: "Altium Finanzas 2.0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <FetchPatch />
        {children}
      </body>
    </html>
  );
}
