import HeaderBox from '@/components/HeaderBox'
import RecentTransactions from '@/components/RecentTransactions';
import RightSidebar from '@/components/RightSidebar';
import TotalBalanceBox from '@/components/TotalBalanceBox';
import { getAccount, getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

const Home = async ({ searchParams: { id, page, refresh } }: SearchParamProps) => {
  const currentPage = Number(page as string) || 1;
  const loggedIn = await getLoggedInUser();
  
  if (!loggedIn) {
    return (
      <section className="home">
        <div className="home-content">
          <header className="home-header">
            <HeaderBox 
              type="greeting"
              title="Welcome"
              user="Guest"
              subtext="Please sign in to access your account."
            />
          </header>
        </div>
      </section>
    );
  }

  console.log("Home page - User logged in:", loggedIn.$id);

  const accounts = await getAccounts({ 
    userId: loggedIn?.$id 
  });

  console.log("Home page - Accounts result:", {
    hasAccounts: !!accounts,
    accountCount: accounts?.data?.length || 0,
  });

  // Ensure accounts has a valid structure
  const accountsData = accounts?.data || [];
  const appwriteItemId = (id as string) || accountsData[0]?.appwriteItemId;

  console.log("Home page - Selected account:", {
    appwriteItemId,
    hasId: !!appwriteItemId,
  });

  // Only try to get account details if we have an appwriteItemId
  let account = null;
  if (appwriteItemId) {
    console.log("Home page - Fetching account details...");
    account = await getAccount({ appwriteItemId });
    
    console.log("Home page - Account details result:", {
      hasAccount: !!account,
      hasTransactions: !!account?.transactions,
      transactionCount: account?.transactions?.length || 0,
    });
  }

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox 
            type="greeting"
            title="Welcome"
            user={loggedIn?.firstName || 'Guest'}
            subtext="Access and manage your account and transactions efficiently."
          />

          <TotalBalanceBox 
            accounts={accountsData}
            totalBanks={accounts?.totalBanks || 0}
            totalCurrentBalance={accounts?.totalCurrentBalance || 0}
          />
        </header>

        <RecentTransactions 
          accounts={accountsData}
          appwriteItemId={appwriteItemId || ''}
          page={currentPage}
        />
      </div>

      <RightSidebar 
        user={loggedIn}
        transactions={account?.transactions || []}
        banks={accountsData?.slice(0, 2) || []}
      />
    </section>
  )
}

export default Home