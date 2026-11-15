'use client';

import React from 'react';
import Link from 'next/link';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Button } from '@/components/ui/button';

export default function BusinessWalletPage() {
  return (
    <div className="space-y-6">
        <BusinessPortalHeader title="Business Wallet" subtitle="Track revenue, ad spend, deposits, and payouts." />
        <div className="rounded-3xl border border-bord-card p-6 space-y-3">
          <p className="text-par-n text-lab-sc">
            All creator payouts and ad budgets use your unified server-authoritative wallet ledger.
          </p>
          <Link href="/wallet">
            <Button variant="primary">Open Unified Wallet Ledger</Button>
          </Link>
        </div>
      </div>
  );
}
