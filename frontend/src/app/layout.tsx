import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sehat Saheli | Care Loop",
  description: "A care-coordination prototype for ASHA workers and PHC staff."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
