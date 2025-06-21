import HeaderBox from '@/components/HeaderBox'
import { Pagination } from '@/components/Pagination';
import TransactionsTable from '@/components/TransactionsTable';
import RelinkBankButton from '@/components/RelinkBankButton';
import { getAccount, getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';
import { formatAmount } from '@/lib/utils';
import React from 'react'

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

const TransactionHistory = async ({ searchParams: { id, page }}:SearchParamProps) => {
  const currentPage = Number(page as string) || 1;
  const loggedIn = await getLoggedInUser();
  
  if (!loggedIn) {
    return <div>Please log in to view transaction history.</div>;
  }
  
  const accounts = await getAccounts({ 
    userId: loggedIn.$id 
  });

  if(!accounts) return <div>No accounts found.</div>;
  
  const accountsData = accounts?.data;
  const appwriteItemId = (id as string) || accountsData[0]?.appwriteItemId;

  if (!appwriteItemId) {
    return <div>No bank account selected.</div>;
  }

  const account = await getAccount({ appwriteItemId });

  if (!account) {
    return <div>Unable to load account information.</div>;
  }

  const rowsPerPage = 10;
  const totalPages = Math.ceil((account?.transactions?.length || 0) / rowsPerPage);

  const indexOfLastTransaction = currentPage * rowsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - rowsPerPage;

  const currentTransactions = account?.transactions?.slice(
    indexOfFirstTransaction, indexOfLastTransaction
  ) || [];
  return (
    <div className="transactions">
      <div className="transactions-header">
        <HeaderBox 
          title="Transaction History"
          subtext="See your bank details and transactions."
        />
      </div>

      <div className="space-y-6">
        <div className="transactions-account">
          <div className="flex flex-col gap-2">
            <h2 className="text-18 font-bold text-white">{account?.data.name}</h2>
            <p className="text-14 text-blue-25">
              {account?.data.officialName}
            </p>
            <p className="text-14 font-semibold tracking-[1.1px] text-white">
              ●●●● ●●●● ●●●● {account?.data.mask}
            </p>
          </div>
          
          <div className='transactions-account-balance'>
            <p className="text-14">Current balance</p>
            <p className="text-24 text-center font-bold">{formatAmount(account?.data.currentBalance)}</p>
          </div>
        </div>

        <section className="flex w-full flex-col gap-6">
          {currentTransactions.length > 0 ? (
            <>
              <TransactionsTable 
                transactions={currentTransactions}
              />
              {totalPages > 1 && (
                <div className="my-4 w-full">
                  <Pagination totalPages={totalPages} page={currentPage} />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No transactions found for this account.</p>
              <p className="text-sm mt-2 mb-4">
                If you recently added this bank account, you may need to re-link it to access transaction data.
              </p>
              <RelinkBankButton 
                user={loggedIn} 
                bankId={appwriteItemId} 
                variant="primary" 
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default TransactionHistory