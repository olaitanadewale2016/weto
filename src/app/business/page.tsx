'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Eye, Megaphone, ShoppingBag, Store, Wallet } from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';

interface BusinessOverview {
  business: { name: string; description?: string; logo?: string; verified?: boolean } | null;
  stores: Array<{ _id: string; name: string; caption?: string }>;
  metrics: {
    productsCount: number;
    jobsCount: number;
    adsCount: number;
    walletBalance: number;
    walletCurrency: string;
    totalAdViews: number;
    totalAdSpend: number;
  };
}

export default function BusinessDashboardPage() {
  const { user, bootstrap, locale } = useApp();
  const [data, setData] = useState<BusinessOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      const id = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(id);
    }
    apiFetch<BusinessOverview>('/business')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="space-y-6">
        <BusinessPortalHeader
          title="Business & Creator Portal"
          subtitle="Manage your storefronts, ad campaigns, job openings, and payouts."
        />

        {loading ? (
          <p className="text-lab-sc py-8 text-center">Loading business metrics...</p>
        ) : !data ? (
          <div className="rounded-3xl border border-bord-card p-6 text-center space-y-3">
            <p className="font-bold text-lab-pr">Sign in to access the Business Portal</p>
            <Link href="/auth/login">
              <Button variant="primary">Sign in</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-3xl border border-bord-card bg-bg-pr p-5 space-y-1">
                <span className="inline-flex items-center gap-1.5 text-cap-l text-lab-sc">
                  <Wallet className="h-4 w-4 text-lab-pr2" /> Wallet Balance
                </span>
                <p className="text-title-1 font-bold text-lab-pr">
                  {formatCurrency(data.metrics.walletBalance, data.metrics.walletCurrency, bootstrap?.currencies, locale)}
                </p>
              </div>
              <div className="rounded-3xl border border-bord-card bg-bg-pr p-5 space-y-1">
                <span className="inline-flex items-center gap-1.5 text-cap-l text-lab-sc">
                  <Megaphone className="h-4 w-4 text-lab-pr2" /> Ad Campaigns
                </span>
                <p className="text-title-1 font-bold text-lab-pr">{data.metrics.adsCount}</p>
                <p className="text-cap-s text-lab-tr">
                  <Eye className="h-3 w-3 inline mr-1" />{data.metrics.totalAdViews} views
                </p>
              </div>
              <div className="rounded-3xl border border-bord-card bg-bg-pr p-5 space-y-1">
                <span className="inline-flex items-center gap-1.5 text-cap-l text-lab-sc">
                  <ShoppingBag className="h-4 w-4 text-lab-pr2" /> Store Products
                </span>
                <p className="text-title-1 font-bold text-lab-pr">{data.metrics.productsCount}</p>
              </div>
              <div className="rounded-3xl border border-bord-card bg-bg-pr p-5 space-y-1">
                <span className="inline-flex items-center gap-1.5 text-cap-l text-lab-sc">
                  <Briefcase className="h-4 w-4 text-lab-pr2" /> Active Jobs
                </span>
                <p className="text-title-1 font-bold text-lab-pr">{data.metrics.jobsCount}</p>
              </div>
            </div>

            {/* Business Account Card */}
            <div className="rounded-3xl border border-bord-card bg-fill-pr/40 p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-fill-qt border border-bord-tr text-lab-pr2 flex items-center justify-center">
                  <Store className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-title-3 font-bold text-lab-pr">
                    {data.business ? data.business.name : 'Set up your Business Profile'}
                  </h2>
                  <p className="text-par-n text-lab-sc">
                    {data.business?.description || 'Add branding, contact info, tax details, and storefronts.'}
                  </p>
                </div>
              </div>
              <Link href="/business/settings">
                <Button variant="primary">{data.business ? 'Manage Business' : 'Configure Business'}</Button>
              </Link>
            </div>
          </>
        )}
      </div>
  );
}
