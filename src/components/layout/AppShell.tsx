import React from 'react';
import Layout from '../Layout';

/**
 * Canonical STEN v5.0.2 application shell.
 * Layout contains the live navigation/context implementation; this stable
 * entry point keeps the architecture aligned with the Executive Cockpit spec.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}
