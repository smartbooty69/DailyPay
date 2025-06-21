import { NextRequest, NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { updateBankAccount } from '@/lib/actions/user.actions';

export async function POST(request: NextRequest) {
  try {
    const { publicToken, bankId } = await request.json();

    if (!publicToken || !bankId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Exchange public token for access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;

    // Update the bank account with the new access token
    const updatedBank = await updateBankAccount({
      bankId,
      accessToken,
    });

    if (!updatedBank) {
      return NextResponse.json(
        { error: 'Failed to update bank account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error exchanging token:', error);
    return NextResponse.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    );
  }
} 