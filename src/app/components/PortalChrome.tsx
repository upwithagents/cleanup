"use client";

import { useEffect, useState } from "react";
import { AscentProgress, PortalHeader, type PortalHeaderApp } from "@upwithagents/ui";

interface PortalContext {
  userName: string;
  userEmail: string;
  apps: PortalHeaderApp[];
}

export function PortalChrome({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<PortalContext | null>(null);

  useEffect(() => {
    fetch("/api/portal/context")
      .then((res) => (res.ok ? (res.json() as Promise<PortalContext>) : null))
      .then(setContext)
      .catch(() => setContext(null));
  }, []);

  // Hold the app's own content back behind the progress bar too, not just
  // the header - otherwise it renders immediately while the header pops in
  // later once the fetch resolves, shoving everything else down the page.
  return (
    <>
      {/* Mounted unconditionally: unmounting it the instant `context`
          resolves would cut its own fill/fade animation short mid-transition,
          which read as a flicker or a broken/discontinuous bar. */}
      <AscentProgress />
      {context && (
        <>
          <div data-portal-chrome>
            <PortalHeader
              currentSlug="cleanup"
              apps={context.apps}
              userName={context.userName}
              userEmail={context.userEmail}
              logoutSlot={<a href="/api/auth/signout">Log out</a>}
            />
          </div>
          {children}
        </>
      )}
    </>
  );
}
