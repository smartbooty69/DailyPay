"use server";

import {
  ACHClass,
  CountryCode,
  TransferAuthorizationCreateRequest,
  TransferCreateRequest,
  TransferNetwork,
  TransferType,
} from "plaid";
import { unstable_noStore as noStore } from 'next/cache';

import { plaidClient } from "../plaid";
import { parseStringify } from "../utils";

import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.actions";

// Get multiple bank accounts
export const getAccounts = async ({ userId }: getAccountsProps) => {
  try {
    // Disable caching to ensure fresh data
    noStore();
    
    // get banks from db
    const banks = await getBanks({ userId });

    if (!banks || banks.length === 0) {
      return parseStringify({ data: [], totalBanks: 0, totalCurrentBalance: 0 });
    }

    const accounts = await Promise.all(
      banks.map(async (bank: Bank) => {
        // get each account info from plaid
        const accountsResponse = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });
        const accountData = accountsResponse.data.accounts[0];

        // get institution info from plaid
        const institution = await getInstitution({
          institutionId: accountsResponse.data.item.institution_id!,
        });

        const account = {
          id: accountData.account_id,
          availableBalance: accountData.balances.available!,
          currentBalance: accountData.balances.current!,
          institutionId: institution.institution_id,
          name: accountData.name,
          officialName: accountData.official_name,
          mask: accountData.mask!,
          type: accountData.type as string,
          subtype: accountData.subtype! as string,
          appwriteItemId: bank.$id,
          sharaebleId: bank.shareableId,
        };

        return account;
      })
    );

    const totalBanks = accounts.length;
    const totalCurrentBalance = accounts.reduce((total, account) => {
      return total + account.currentBalance;
    }, 0);

    return parseStringify({ data: accounts, totalBanks, totalCurrentBalance });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
    return parseStringify({ data: [], totalBanks: 0, totalCurrentBalance: 0 });
  }
};

// Get one bank account
export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    // Disable caching to ensure fresh data
    noStore();
    
    if (!appwriteItemId) {
      console.log("No appwriteItemId provided for getAccount");
      return null;
    }

    console.log("Getting account for appwriteItemId:", appwriteItemId);

    // get bank from db
    const bank = await getBank({ documentId: appwriteItemId });

    if (!bank) {
      console.log("No bank found for appwriteItemId:", appwriteItemId);
      return null;
    }

    console.log("Bank found:", {
      id: bank.$id,
      accountId: bank.accountId,
      hasAccessToken: !!bank.accessToken,
    });

    // get account info from plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });
    const accountData = accountsResponse.data.accounts[0];

    console.log("Account data from Plaid:", {
      accountId: accountData.account_id,
      name: accountData.name,
      balance: accountData.balances.current,
    });

    // get transfer transactions from appwrite
    const transferTransactionsData = await getTransactionsByBankId({
      bankId: bank.$id,
    });

    console.log("Transfer transactions from Appwrite:", {
      total: transferTransactionsData?.total || 0,
      documents: transferTransactionsData?.documents?.length || 0,
    });

    const transferTransactions = transferTransactionsData?.documents?.map(
      (transferData: Transaction) => ({
        id: transferData.$id,
        name: transferData.name!,
        amount: transferData.amount!,
        date: transferData.$createdAt,
        paymentChannel: transferData.channel,
        category: transferData.category,
        type: transferData.senderBankId === bank.$id ? "debit" : "credit",
      })
    ) || [];

    // get institution info from plaid
    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    console.log("Fetching Plaid transactions...");
    const transactions = await getTransactions({
      accessToken: bank?.accessToken,
    });

    console.log("Plaid transactions result:", {
      hasTransactions: !!transactions,
      transactionCount: transactions?.length || 0,
    });

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available!,
      currentBalance: accountData.balances.current!,
      institutionId: institution?.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask!,
      type: accountData.type as string,
      subtype: accountData.subtype! as string,
      appwriteItemId: bank.$id,
    };

    // sort transactions by date such that the most recent transaction is first
    const allTransactions = [...(transactions || []), ...transferTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    console.log("Final transaction summary:", {
      plaidTransactions: transactions?.length || 0,
      transferTransactions: transferTransactions.length,
      totalTransactions: allTransactions.length,
    });

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
    return null;
  }
};

// Get bank info
export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const intitution = institutionResponse.data.institution;

    return parseStringify(intitution);
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
    return null;
  }
};

// Get transactions
export const getTransactions = async ({
  accessToken,
}: getTransactionsProps) => {
  try {
    console.log("Fetching transactions for access token:", accessToken ? "VALID" : "INVALID");
    
    if (!accessToken) {
      console.error("No access token provided for transaction fetching");
      return [];
    }

    // Use transactionsGet instead of transactionsSync for initial data fetch
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
      end_date: new Date().toISOString().split('T')[0], // today
      options: {
        count: 100,
        offset: 0,
        include_personal_finance_category: true,
      }
    });

    console.log("Plaid transactions response:", {
      total: response.data.total_transactions,
      accounts: response.data.accounts?.length || 0,
      hasTransactions: response.data.transactions?.length > 0,
    });

    const transactions = response.data.transactions?.map((transaction) => ({
      id: transaction.transaction_id,
      name: transaction.name,
      paymentChannel: transaction.payment_channel,
      type: transaction.payment_channel,
      accountId: transaction.account_id,
      amount: transaction.amount,
      pending: transaction.pending,
      category: transaction.personal_finance_category?.[0] || transaction.category?.[0] || "",
      date: transaction.date,
      image: transaction.logo_url,
    })) || [];

    console.log("Processed transactions:", transactions.length);
    return parseStringify(transactions);
  } catch (error: any) {
    console.error("An error occurred while getting transactions:", error);
    
    // Handle the specific case where user consent is missing for transactions
    if (error.response?.data?.error_code === 'ADDITIONAL_CONSENT_REQUIRED') {
      console.log("User needs to re-link bank account to access transactions");
      return [];
    }
    
    console.error("Error details:", {
      status: error.response?.status,
      message: error.response?.data?.error_message,
      code: error.response?.data?.error_code,
    });
    return [];
  }
};