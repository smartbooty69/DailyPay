'use server';

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";
import { unstable_noStore as noStore } from 'next/cache';

import { plaidClient } from '@/lib/plaid';
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer, findCustomerByEmail } from "./dwolla.actions";

// Simple validation function for customer data
const validateCustomerData = (customerData: any) => {
  const errors: string[] = [];
  
  // Check required fields
  if (!customerData.firstName || customerData.firstName.trim() === '') {
    errors.push("firstName is required");
  }
  
  if (!customerData.lastName || customerData.lastName.trim() === '') {
    errors.push("lastName is required");
  }
  
  if (!customerData.email || customerData.email.trim() === '') {
    errors.push("email is required");
  }
  
  if (!customerData.type || customerData.type.trim() === '') {
    errors.push("type is required");
  }
  
  if (!customerData.address1 || customerData.address1.trim() === '') {
    errors.push("address1 is required");
  }
  
  if (!customerData.city || customerData.city.trim() === '') {
    errors.push("city is required");
  }
  
  if (!customerData.state || customerData.state.trim() === '') {
    errors.push("state is required");
  } else if (customerData.state.length !== 2) {
    errors.push("state must be a 2-letter abbreviation");
  }
  
  if (!customerData.postalCode || customerData.postalCode.trim() === '') {
    errors.push("postalCode is required");
  }
  
  if (!customerData.dateOfBirth || customerData.dateOfBirth.trim() === '') {
    errors.push("dateOfBirth is required");
  } else if (!customerData.dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("dateOfBirth must be in YYYY-MM-DD format");
  }
  
  if (!customerData.ssn || customerData.ssn.trim() === '') {
    errors.push("ssn is required");
  } else if (!customerData.ssn.match(/^\d{9}$/)) {
    errors.push("ssn must be 9 digits");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {
    if (!userId) {
      return null;
    }

    const { database } = await createAdminClient();

    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )

    const result = parseStringify(user.documents[0] || null);
    return result;
  } catch (error) {
    console.log('Error in getUserInfo:', error)
    return null;
  }
}

export const createUserDocument = async (userData: { userId: string; email: string; name: string; }) => {
  try {
    const { database } = await createAdminClient();
    
    const [firstName, ...lastNameParts] = userData.name.split(' ');
    const lastName = lastNameParts.join(' ');

    // Create a basic user document with only the required fields
    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        userId: userData.userId,
        email: userData.email,
        firstName: firstName || 'User',
        lastName: lastName || '',
        address1: '',
        city: '',
        state: '',
        postalCode: '',
        dateOfBirth: '',
        ssn: '',
        dwollaCustomerId: '',
        dwollaCustomerUrl: ''
      }
    );

    return parseStringify(newUser);
  } catch (error) {
    console.error('Error creating user document:', error);
    return null;
  }
}

export const signIn = async ({ email, password }: signInProps) => {
  try {
    const { account, user: userAdmin } = await createAdminClient();
    
    const session = await account.createEmailPasswordSession(email, password);

    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    let user = await getUserInfo({ userId: session.userId }) 

    // If user document doesn't exist, create one
    if (!user) {
      const appwriteUser = await userAdmin.get(session.userId);

      user = await createUserDocument({
        userId: appwriteUser.$id,
        email: appwriteUser.email,
        name: appwriteUser.name,
      });
    }

    return parseStringify(user);
  } catch (error) {
    console.error('Error in signIn:', error);
    return null;
  }
}

export const signUp = async ({ password, ...userData }: SignUpParams) => {
  const { email, firstName, lastName } = userData;
  
  let newUserAccount;

  try {
    const { account, database } = await createAdminClient();

    newUserAccount = await account.create(
      ID.unique(), 
      email, 
      password, 
      `${firstName} ${lastName}`
    );

    if(!newUserAccount) throw new Error('Error creating user')

    console.log("Creating Dwolla customer for user:", email);
    const dwollaCustomerUrl = await createDwollaCustomer({
      ...userData,
      type: 'personal'
    })

    console.log("Dwolla customer creation result:", {
      url: dwollaCustomerUrl,
      isUrl: typeof dwollaCustomerUrl === 'string',
      urlLength: dwollaCustomerUrl?.length || 0,
    });

    if(!dwollaCustomerUrl) throw new Error('Error creating Dwolla customer')

    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);
    console.log("Dwolla customer created successfully:", {
      url: dwollaCustomerUrl,
      id: dwollaCustomerId,
      extractedId: dwollaCustomerId,
      idLength: dwollaCustomerId?.length || 0,
    });

    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId: newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl
      }
    )

    const session = await account.createEmailPasswordSession(email, password);

    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    return parseStringify(newUser);
  } catch (error) {
    console.error('Error', error);
    return null;
  }
}

export async function getLoggedInUser() {
  try {
    noStore();
    
    const sessionSecret = cookies().get("appwrite-session")?.value;

    if (!sessionSecret) {
      return null;
    }

    const { account } = await createSessionClient(sessionSecret);

    const user = await account.get();

    const userInfo = await getUserInfo({ userId: user.$id });

    return userInfo;
  } catch (error) {
    console.error('Error in getLoggedInUser:', error);
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();

    cookies().delete('appwrite-session');

    await account.deleteSession('current');
  } catch (error) {
    return null;
  }
}

export const createLinkToken = async (user: User) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.$id
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ['auth', 'transactions'] as Products[],
      language: 'en',
      country_codes: ['US'] as CountryCode[],
    }

    const response = await plaidClient.linkTokenCreate(tokenParams);

    return parseStringify({ linkToken: response.data.link_token })
  } catch (error) {
    console.log(error);
  }
}

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: createBankAccountProps) => {
  try {
    const { database } = await createAdminClient();

    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        shareableId,
      }
    )

    return parseStringify(bankAccount);
  } catch (error) {
    console.log(error);
  }
}

export const updateBankAccount = async ({
  bankId,
  accessToken,
}: {
  bankId: string;
  accessToken: string;
}) => {
  try {
    const { database } = await createAdminClient();

    const updatedBankAccount = await database.updateDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      bankId,
      {
        accessToken,
      }
    );

    return parseStringify(updatedBankAccount);
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const exchangePublicToken = async ({
  publicToken,
  user,
}: exchangePublicTokenProps) => {
  try {
    console.log("exchangePublicToken called with user:", {
      userId: user.$id,
      email: user.email,
      dwollaCustomerId: user.dwollaCustomerId,
      dwollaCustomerUrl: user.dwollaCustomerUrl,
      hasCustomerId: !!user.dwollaCustomerId,
      customerIdLength: user.dwollaCustomerId?.length || 0,
    });

    // Check if user has a valid Dwolla customer ID
    if (!user.dwollaCustomerId || user.dwollaCustomerId.trim() === '') {
      console.log("User does not have a Dwolla customer ID, attempting to create one...");
      
      // Validate and prepare customer data for Dwolla
      const customerData = {
        firstName: user.firstName || 'User',
        lastName: user.lastName || 'User',
        email: user.email,
        type: 'personal' as const,
        address1: user.address1 || '123 Main St',
        city: user.city || 'New York',
        state: user.state || 'NY', // Default to NY if not provided
        postalCode: user.postalCode || '10001',
        dateOfBirth: user.dateOfBirth || '1990-01-01', // Default date if not provided
        ssn: user.ssn || '123456789', // Default SSN for sandbox testing
      };
      
      // Validate state format
      if (customerData.state.length !== 2) {
        console.error("Invalid state format. State must be a 2-letter abbreviation. Using default 'NY'");
        customerData.state = 'NY';
      }
      
      // Validate date format (YYYY-MM-DD)
      if (!customerData.dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error("Invalid date format. Date must be in YYYY-MM-DD format. Using default '1990-01-01'");
        customerData.dateOfBirth = '1990-01-01';
      }
      
      // Validate SSN format (9 digits)
      if (!customerData.ssn.match(/^\d{9}$/)) {
        console.error("Invalid SSN format. SSN must be 9 digits. Using default '123456789'");
        customerData.ssn = '123456789';
      }
      
      console.log("Prepared customer data for Dwolla:", customerData);
      
      // Validate customer data before sending to Dwolla
      const validation = validateCustomerData(customerData);
      console.log("Local validation result:", validation);
      if (!validation.isValid) {
        console.error("Customer data validation failed:", validation.errors);
        throw new Error(`Invalid customer data: ${validation.errors.join(', ')}`);
      }
      
      console.log("Local validation passed, attempting to create Dwolla customer...");
      
      // Try to create a Dwolla customer for the user
      const dwollaCustomerUrl = await createDwollaCustomer(customerData);
      
      console.log("Dwolla customer creation result:", dwollaCustomerUrl);
      
      if (dwollaCustomerUrl) {
        const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);
        console.log("Created new Dwolla customer:", { url: dwollaCustomerUrl, id: dwollaCustomerId });
        
        // Update the user document with the new Dwolla customer ID
        const { database } = await createAdminClient();
        await database.updateDocument(
          DATABASE_ID!,
          USER_COLLECTION_ID!,
          user.$id,
          {
            dwollaCustomerId,
            dwollaCustomerUrl,
          }
        );
        
        // Update the user object for this function
        user.dwollaCustomerId = dwollaCustomerId;
        user.dwollaCustomerUrl = dwollaCustomerUrl;
      } else {
        console.error("Failed to create Dwolla customer for user");
        throw new Error("Failed to create Dwolla customer");
      }
    }

    // Exchange public token for access token and item ID
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;
    
    // Get account information from Plaid using the access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountData = accountsResponse.data.accounts[0];

    // Create a processor token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(request);
    const processorToken = processorTokenResponse.data.processor_token;

    console.log("About to create funding source with:", {
      dwollaCustomerId: user.dwollaCustomerId,
      bankName: accountData.name,
      hasProcessorToken: !!processorToken,
    });

     // Create a funding source URL for the account using the Dwolla customer ID, processor token, and bank name
     const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    });
    
    // If the funding source URL is not created, throw an error
    if (!fundingSourceUrl) {
      console.error("Failed to create funding source URL");
      throw new Error("Failed to create funding source");
    }

    // Create a bank account using the user ID, item ID, account ID, access token, funding source URL, and shareableId ID
    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      shareableId: encryptId(accountData.account_id),
    });

    // Revalidate the path to reflect the changes
    revalidatePath("/");

    // Return a success message
    return parseStringify({
      publicTokenExchange: "complete",
    });
  } catch (error) {
    console.error("An error occurred while creating exchanging token:", error);
    throw error; // Re-throw the error to see it in the client
  }
}

export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    noStore();
    
    if (!userId) {
      return [];
    }

    const { database } = await createAdminClient();

    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )

    return parseStringify(banks.documents);
  } catch (error) {
    console.log(error)
    return [];
  }
}

export const getBank = async ({ documentId }: getBankProps) => {
  try {
    noStore();
    
    if (!documentId) {
      return null;
    }

    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('$id', [documentId])]
    )

    return parseStringify(bank.documents[0] || null);
  } catch (error) {
    console.log(error)
    return null;
  }
}

export const getBankByAccountId = async ({ accountId }: getBankByAccountIdProps) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('accountId', [accountId])]
    )

    if(bank.total !== 1) return null;

    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.log(error)
  }
}