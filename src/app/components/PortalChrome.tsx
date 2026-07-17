"use client";

import { useEffect, useState } from "react";
import { PortalHeader, type PortalHeaderApp } from "@upwithagents/ui";

interface PortalContext {
  userName: string;
  userEmail: string;
  apps: PortalHeaderApp[];
}

export function PortalChrome() {
  const [context, setContext] = useState<PortalContext | null>(null);

  useEffect(() => {
    fetch("/api/portal/context")
      .then((res) => (res.ok ? (res.json() as Promise<PortalContext>) : null))
      .then(setContext)
      .catch(() => setContext(null));
  }, []);

  if (!context) return null;

  return (
    <div data-portal-chrome>
      <PortalHeader
        currentSlug="cleanup"
        apps={context.apps}
        userName={context.userName}
        userEmail={context.userEmail}
        logoutSlot={<a href="/api/auth/signout">Log out</a>}
      />
    </div>
  );
}
