import type { Metadata, Viewport } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Serifa elegante para títulos (secção "estilo de álbum partilhado"),
// mantendo a Geist Sans para texto corrido e controlos — o mesmo
// contraste serifa/sem-serifa de um convite impresso.
const playfairDisplay = Playfair_Display({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "LiveGallery",
    template: "%s · LiveGallery",
  },
  description:
    "Crie e partilhe galerias de fotografias de eventos em tempo real.",
};

// viewportFit "cover" + os utilitários de safe-area em globals.css
// deixam a grelha e a barra de ações desenharem-se até às bordas em
// ecrãs com notch/ilha dinâmica, sem conteúdo escondido atrás deles
// (uso predominante em telemóvel — secção 10 do CLAUDE.md).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-PT"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
