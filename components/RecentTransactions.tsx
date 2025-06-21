"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BankTabItem } from './BankTabItem'
import BankInfo from './BankInfo'
import TransactionsTable from './TransactionsTable'
import { Pagination } from './Pagination'
import RelinkBankButton from './RelinkBankButton'
import { getAccount } from '@/lib/actions/bank.actions'
import { getLoggedInUser } from '@/lib/actions/user.actions'

const RecentTransactions = ({
  accounts,
  appwriteItemId,
  page = 1,
}: Omit<RecentTransactionsProps, 'transactions'>) => {
  const [accountTransactions, setAccountTransactions] = useState<{[key: string]: any[]}>({});
  const [loading, setLoading] = useState<{[key: string]: boolean}>({});
  const [user, setUser] = useState<any>(null);

  console.log("RecentTransactions component:", {
    accountsCount: accounts?.length || 0,
    appwriteItemId,
    page,
  });

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const currentUser = await getLoggedInUser();
      setUser(currentUser);
    };
    getUser();
  }, []);

  // Fetch transactions for each account
  const fetchAccountTransactions = async (accountId: string) => {
    if (accountTransactions[accountId] || loading[accountId]) return;
    
    console.log(`Fetching transactions for account: ${accountId}`);
    setLoading(prev => ({ ...prev, [accountId]: true }));
    
    try {
      const account = await getAccount({ appwriteItemId: accountId });
      console.log(`Account data for ${accountId}:`, {
        hasAccount: !!account,
        hasTransactions: !!account?.transactions,
        transactionCount: account?.transactions?.length || 0,
      });
      
      if (account?.transactions) {
        setAccountTransactions(prev => ({
          ...prev,
          [accountId]: account.transactions
        }));
        console.log(`Set transactions for ${accountId}:`, account.transactions.length);
      }
    } catch (error) {
      console.error(`Error fetching transactions for account ${accountId}:`, error);
    } finally {
      setLoading(prev => ({ ...prev, [accountId]: false }));
    }
  };

  // Fetch transactions for all accounts on mount
  useEffect(() => {
    accounts.forEach(account => {
      fetchAccountTransactions(account.appwriteItemId);
    });
  }, [accounts]);

  // Get transactions for a specific account
  const getTransactionsForAccount = (accountId: string) => {
    return accountTransactions[accountId] || [];
  };

  // Get paginated transactions for a specific account
  const getPaginatedTransactions = (accountId: string, currentPage: number) => {
    const transactions = getTransactionsForAccount(accountId);
    const rowsPerPage = 10;
    const indexOfLastTransaction = currentPage * rowsPerPage;
    const indexOfFirstTransaction = indexOfLastTransaction - rowsPerPage;
    
    return transactions.slice(indexOfFirstTransaction, indexOfLastTransaction);
  };

  return (
    <section className="recent-transactions">
      <header className="flex items-center justify-between">
        <h2 className="recent-transactions-label">Recent transactions</h2>
        <Link
          href={`/transaction-history/?id=${appwriteItemId}`}
          className="view-all-btn"
        >
          View all
        </Link>
      </header>

      <Tabs defaultValue={appwriteItemId} className="w-full">
      <TabsList className="recent-transactions-tablist">
          {accounts.map((account: Account) => (
            <TabsTrigger key={account.id} value={account.appwriteItemId}>
              <BankTabItem
                key={account.id}
                account={account}
                appwriteItemId={appwriteItemId}
              />
            </TabsTrigger>
          ))}
        </TabsList>

        {accounts.map((account: Account) => {
          const transactions = getTransactionsForAccount(account.appwriteItemId);
          const currentTransactions = getPaginatedTransactions(account.appwriteItemId, page);
          const rowsPerPage = 10;
          const totalPages = Math.ceil(transactions.length / rowsPerPage);

          return (
            <TabsContent
              value={account.appwriteItemId}
              key={account.id}
              className="space-y-4"
            >
              <BankInfo 
                account={account}
                appwriteItemId={appwriteItemId}
                type="full"
              />

              {loading[account.appwriteItemId] ? (
                <div className="text-center py-8 text-gray-500">
                  Loading transactions...
                </div>
              ) : transactions.length > 0 ? (
                <TransactionsTable transactions={currentTransactions} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No transactions found for this account.</p>
                  <p className="text-sm mt-2 mb-4">
                    If you recently added this bank account, you may need to re-link it to access transaction data.
                  </p>
                  {user && (
                    <RelinkBankButton 
                      user={user} 
                      bankId={account.appwriteItemId} 
                      variant="primary" 
                    />
                  )}
                </div>
              )}

              {totalPages > 1 && (
                <div className="my-4 w-full">
                  <Pagination totalPages={totalPages} page={page} />
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  )
}

export default RecentTransactions