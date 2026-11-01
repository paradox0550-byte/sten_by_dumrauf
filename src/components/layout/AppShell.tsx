import React from 'react';
import Layout from '../Layout';
import InlineGuide from '../InlineGuide';
import LadarLauncher from '../../features/ladar/LadarLauncher';

/**
 * Canonical application shell. Contextual onboarding lives inside the existing
 * content flow, so it never opens a blocking modal or reloads the page.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Layout>
      <InlineGuide />
      {children}
      <LadarLauncher />
    </Layout>
  );
}
