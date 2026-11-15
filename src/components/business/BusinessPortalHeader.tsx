'use client';

import React from 'react';

export function BusinessPortalHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="pb-4 border-b border-bord-pr">
      <h1 className="text-title-2 font-bold text-lab-pr">{title}</h1>
      {subtitle && <p className="text-cap-l text-lab-sc mt-1">{subtitle}</p>}
    </div>
  );
}
