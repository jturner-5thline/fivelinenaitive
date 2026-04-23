import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { VdrShell } from '@/components/vdr/VdrShell';

export default function VirtualDataRoom() {
  const { dealId } = useParams<{ dealId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!dealId) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Data Room | naitive</title>
      </Helmet>
      <VdrShell dealId={dealId} />
    </>
  );
}
