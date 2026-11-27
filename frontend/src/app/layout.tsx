import type { Metadata } from "next";
import "./globals.css";
import "./tokens.css";
import "./base.css";
import "./asha-workspace.css";

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
