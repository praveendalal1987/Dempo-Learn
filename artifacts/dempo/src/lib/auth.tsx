import { ClerkProvider, useAuth, SignIn, SignUp } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains.
const publishableKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Empty in dev (Clerk hits dev FAPI directly), auto-set in prod. Do NOT gate on
// PROD/NODE_ENV or add a fallback — the empty dev value is intentional.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!publishableKey) {
  throw new Error("Missing Publishable Key");
}

export function ClerkQueryClientCacheInvalidator() {
  const { sessionId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries();
  }, [sessionId, queryClient]);

  return null;
}

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        variables: {
          // Brand violet — matches the violet/fuchsia gradient palette
          colorPrimary: 'hsl(271 81% 56%)',
          colorBackground: 'hsl(0 0% 100%)',
          fontFamily: "'Outfit', sans-serif",
          borderRadius: '0.75rem',
        },
        elements: {
          card: "shadow-lg border border-border",
          headerTitle: "font-serif text-2xl text-foreground",
          headerSubtitle: "text-muted-foreground",
          formButtonPrimary:
            "bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white font-medium border-0 shadow-md",
          footerActionLink:
            "text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 font-semibold",
        }
      }}
      localization={{
        signIn: {
          start: {
            title: "Sign in to Dempo Learn",
            subtitle: "Welcome back! Please sign in to continue",
          },
        },
        signUp: {
          start: {
            title: "Create your Dempo Learn account",
            subtitle: "Join the fun — it's free",
          },
        },
      }}
    >
      <ClerkQueryClientCacheInvalidator />
      {children}
    </ClerkProvider>
  );
}
