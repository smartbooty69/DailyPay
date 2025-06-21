"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/button';
import { PlaidLinkOnSuccess, PlaidLinkOptions, usePlaidLink } from 'react-plaid-link';
import { useRouter } from 'next/navigation';
import { createLinkToken, updateBankAccount } from '@/lib/actions/user.actions';
import { exchangePublicToken } from '@/lib/actions/user.actions';

interface RelinkBankButtonProps {
  user: any;
  bankId: string;
  variant?: "primary" | "ghost";
}

const RelinkBankButton = ({ user, bankId, variant = "primary" }: RelinkBankButtonProps) => {
  const router = useRouter();
  const [token, setToken] = useState('');

  useEffect(() => {
    const getLinkToken = async () => {
      const data = await createLinkToken(user);
      setToken(data?.linkToken);
    };

    getLinkToken();
  }, [user]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (public_token: string) => {
    try {
      // Exchange the public token for an access token
      const response = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicToken: public_token,
          bankId: bankId,
        }),
      });

      if (response.ok) {
        // Force refresh by adding a timestamp to the URL
        router.push(`/?refresh=${Date.now()}`);
        
        // Force a full page refresh to ensure all data is updated
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    } catch (error) {
      console.error('Error updating bank account:', error);
    }
  }, [user, bankId, router]);

  const config: PlaidLinkOptions = {
    token,
    onSuccess
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <Button
      onClick={() => open()}
      disabled={!ready}
      variant={variant}
      className="plaidlink-primary"
    >
      Re-link Bank Account
    </Button>
  );
};

export default RelinkBankButton; 