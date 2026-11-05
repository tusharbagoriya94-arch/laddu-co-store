import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import siteCss from "../site.css?url";
import { CartProvider } from "../lib/cart";

const TITLE = "LADDU.CO | Seth ji ke laddu aur mathri";
const DESCRIPTION =
  "Seth ji ke laddu aur mathri. Sanwariya Ji ki sabse famous mithai, saalon se logon ka bharosa. Online order karein, ghar tak delivery.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "author", content: "LADDU.CO" },
      { name: "theme-color", content: "#6F262D" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "LADDU.CO" },
      { property: "og:image", content: "/assets/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/assets/og.jpg" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Rozha+One&family=Mukta:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: siteCss },
      { rel: "icon", href: "/assets/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function NotFoundComponent() {
  return (
    <div className="center-screen">
      <div className="notice-card">
        <h1>Yeh page nahi mila</h1>
        <p>Jo page aap dhoondh rahe hain, woh yahan nahi hai.</p>
        <Link to="/" className="btn-solid">Home par jaayein</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="center-screen">
      <div className="notice-card">
        <h1>Page load nahi hua</h1>
        <p>Kuch gadbad ho gayi. Dobara try kariye.</p>
        <div className="notice-actions">
          <button
            type="button"
            className="btn-solid"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Dobara try karein
          </button>
          <a href="/" className="btn-line">Home</a>
        </div>
      </div>
    </div>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="hi-Latn" style={{ colorScheme: "light" }}>
      <head>
        <HeadContent />
      </head>
      <body className="site-body">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <Outlet />
      </CartProvider>
    </QueryClientProvider>
  );
}
