"use server";

import { Client } from "dwolla-v2";

const getEnvironment = (): "production" | "sandbox" => {
  const environment = process.env.DWOLLA_ENV as string;

  console.log("Dwolla environment configuration:", {
    environment,
    hasKey: !!process.env.DWOLLA_KEY,
    hasSecret: !!process.env.DWOLLA_SECRET,
    keyLength: process.env.DWOLLA_KEY?.length || 0,
    secretLength: process.env.DWOLLA_SECRET?.length || 0,
  });

  switch (environment) {
    case "sandbox":
      return "sandbox";
    case "production":
      return "production";
    default:
      throw new Error(
        "Dwolla environment should either be set to `sandbox` or `production`"
      );
  }
};

const dwollaClient = new Client({
  environment: getEnvironment(),
  key: process.env.DWOLLA_KEY as string,
  secret: process.env.DWOLLA_SECRET as string,
});

// Test Dwolla configuration
export const testDwollaConfig = async () => {
  try {
    console.log("Testing Dwolla configuration...");
    console.log("Environment variables check:", {
      DWOLLA_ENV: process.env.DWOLLA_ENV,
      DWOLLA_KEY: process.env.DWOLLA_KEY ? "SET" : "NOT SET",
      DWOLLA_SECRET: process.env.DWOLLA_SECRET ? "SET" : "NOT SET",
    });
    
    // Try to access the customers endpoint instead of root
    const response = await dwollaClient.get("customers");
    console.log("Dwolla API is accessible, customers endpoint response:", response.body);
    return true;
  } catch (err: any) {
    console.error("Dwolla configuration test failed:", err);
    console.error("Error status:", err.status);
    console.error("Error body:", err.body);
    return false;
  }
};

// Create a Dwolla Funding Source using a Plaid Processor Token
export const createFundingSource = async (
  options: CreateFundingSourceOptions
) => {
  try {
    // Validate customer ID
    if (!options.customerId || options.customerId.trim() === '') {
      console.error("Invalid customer ID:", options.customerId);
      return null;
    }
    
    // Ensure customer ID is properly formatted
    const customerId = options.customerId.trim();
    console.log("Making API call to create funding source for customer:", customerId);
    
    // According to Dwolla API docs, the request should include the on-demand authorization link
    const requestBody = {
      name: options.fundingSourceName,
      plaidToken: options.plaidToken,
      _links: options._links,
    };
    
    console.log("Request body:", JSON.stringify(requestBody, null, 2));
    
    const response = await dwollaClient
      .post(`customers/${customerId}/funding-sources`, requestBody);
    
    const location = response.headers.get("location");
    console.log("Funding source created successfully, location:", location);
    return location;
  } catch (err: any) {
    console.error("Creating a Funding Source Failed: ", err);
    console.error("Error status:", err.status);
    console.error("Error body:", err.body);
    console.error("Error details:", {
      customerId: options.customerId,
      fundingSourceName: options.fundingSourceName,
      hasPlaidToken: !!options.plaidToken,
      hasLinks: !!options._links,
    });
    
    // Handle duplicate resource error (bank already exists)
    if (err.status === 400 && err.body && err.body.code === 'DuplicateResource') {
      console.log("Duplicate funding source detected, extracting existing funding source URL...");
      
      // Extract the existing funding source URL from the error response
      if (err.body._links && err.body._links.about && err.body._links.about.href) {
        const existingFundingSourceUrl = err.body._links.about.href;
        console.log("Found existing funding source URL:", existingFundingSourceUrl);
        return existingFundingSourceUrl;
      }
    }
    
    // Try alternative request format if the first one fails
    if (err.status === 404) {
      console.log("Trying alternative request format...");
      try {
        const alternativeRequestBody = {
          name: options.fundingSourceName,
          plaidToken: options.plaidToken,
        };
        
        console.log("Alternative request body:", JSON.stringify(alternativeRequestBody, null, 2));
        
        const alternativeResponse = await dwollaClient
          .post(`customers/${customerId}/funding-sources`, alternativeRequestBody);
        
        const alternativeLocation = alternativeResponse.headers.get("location");
        console.log("Funding source created successfully with alternative format, location:", alternativeLocation);
        return alternativeLocation;
      } catch (alternativeErr: any) {
        console.error("Alternative request also failed:", alternativeErr);
        return null;
      }
    }
    
    return null;
  }
};

export const createOnDemandAuthorization = async () => {
  try {
    const onDemandAuthorization = await dwollaClient.post(
      "on-demand-authorizations"
    );
    const authLink = onDemandAuthorization.body._links;
    console.log("On-demand authorization created:", JSON.stringify(authLink, null, 2));
    return authLink;
  } catch (err) {
    console.error("Creating an On Demand Authorization Failed: ", err);
    return null;
  }
};

export const createDwollaCustomer = async (
  newCustomer: NewDwollaCustomerParams
) => {
  try {
    console.log("=== Starting Dwolla customer creation ===");
    console.log("Customer data received:", newCustomer);
    
    // Test environment variables
    console.log("Environment variables check:", {
      DWOLLA_ENV: process.env.DWOLLA_ENV,
      DWOLLA_KEY: process.env.DWOLLA_KEY ? "SET" : "NOT SET",
      DWOLLA_SECRET: process.env.DWOLLA_SECRET ? "SET" : "NOT SET",
    });
    
    // Test Dwolla configuration first
    console.log("Testing Dwolla configuration...");
    const configTest = await testDwollaConfig();
    if (!configTest) {
      console.error("Dwolla configuration test failed - cannot create customer");
      return null;
    }
    console.log("Dwolla configuration test passed");
    
    console.log("Creating Dwolla customer with data:", {
      firstName: newCustomer.firstName,
      lastName: newCustomer.lastName,
      email: newCustomer.email,
      type: newCustomer.type,
    });
    
    console.log("Making API call to Dwolla...");
    const response = await dwollaClient
      .post("customers", newCustomer);
    
    const location = response.headers.get("location");
    console.log("Dwolla customer created successfully, location:", location);
    console.log("=== Dwolla customer creation completed ===");
    return location;
  } catch (err: any) {
    console.error("=== Dwolla customer creation failed ===");
    console.error("Creating a Dwolla Customer Failed: ", err);
    console.error("Error status:", err.status);
    console.error("Error body:", err.body);
    console.error("Request data:", newCustomer);
    
    // Check if this is a duplicate customer error
    if (err.status === 400 && err.body && err.body._embedded && err.body._embedded.errors) {
      const duplicateError = err.body._embedded.errors.find((error: any) => 
        error.code === 'Duplicate' && error.path === '/email'
      );
      
      if (duplicateError) {
        console.log("Duplicate customer detected, searching for existing customer...");
        
        // Find the existing customer by email
        const existingCustomer = await findCustomerByEmail(newCustomer.email);
        
        if (existingCustomer) {
          // Return the URL of the existing customer
          const customerUrl = `https://api-sandbox.dwolla.com/customers/${existingCustomer.id}`;
          console.log("Returning existing customer URL:", customerUrl);
          console.log("=== Existing customer found and returned ===");
          return customerUrl;
        }
      }
    }
    
    // Log specific validation errors if available
    if (err.body && err.body._embedded && err.body._embedded.errors) {
      console.error("Validation errors:");
      err.body._embedded.errors.forEach((error: any, index: number) => {
        console.error(`Error ${index + 1}:`, {
          code: error.code,
          message: error.message,
          path: error.path,
        });
      });
    }
    
    return null;
  }
};

// Check if a customer exists
export const getCustomer = async (customerId: string) => {
  try {
    const response = await dwollaClient.get(`customers/${customerId}`);
    return response.body;
  } catch (err) {
    console.error("Getting Dwolla Customer Failed: ", err);
    return null;
  }
};

// Find customer by email
export const findCustomerByEmail = async (email: string) => {
  try {
    console.log("Searching for existing customer with email:", email);
    
    // Get all customers and search for the one with matching email
    const response = await dwollaClient.get("customers");
    const customers = response.body._embedded?.customers || [];
    
    console.log(`Found ${customers.length} customers in Dwolla`);
    
    // Search for customer with matching email
    const existingCustomer = customers.find((customer: any) => 
      customer.email === email
    );
    
    if (existingCustomer) {
      console.log("Found existing customer:", {
        id: existingCustomer.id,
        email: existingCustomer.email,
        firstName: existingCustomer.firstName,
        lastName: existingCustomer.lastName,
      });
      return existingCustomer;
    }
    
    console.log("No existing customer found with email:", email);
    return null;
  } catch (err) {
    console.error("Finding customer by email failed:", err);
    return null;
  }
};

export const createTransfer = async ({
  sourceFundingSourceUrl,
  destinationFundingSourceUrl,
  amount,
}: TransferParams) => {
  try {
    const requestBody = {
      _links: {
        source: {
          href: sourceFundingSourceUrl,
        },
        destination: {
          href: destinationFundingSourceUrl,
        },
      },
      amount: {
        currency: "USD",
        value: amount,
      },
    };
    return await dwollaClient
      .post("transfers", requestBody)
      .then((res) => res.headers.get("location"));
  } catch (err) {
    console.error("Transfer fund failed: ", err);
  }
};

export const addFundingSource = async ({
  dwollaCustomerId,
  processorToken,
  bankName,
}: AddFundingSourceParams) => {
  try {
    // Test environment variables first
    const envTest = testEnvironmentVariables();
    if (!envTest) {
      console.error("Environment variables test failed");
      return null;
    }
    
    // Test Dwolla configuration first
    const configTest = await testDwollaConfig();
    if (!configTest) {
      console.error("Dwolla configuration test failed");
      return null;
    }
    
    // Check if customer exists first
    const customer = await getCustomer(dwollaCustomerId);
    if (!customer) {
      console.error("Customer not found:", dwollaCustomerId);
      return null;
    }
    
    console.log("Customer found:", customer.id);
    
    // create dwolla auth link
    const dwollaAuthLinks = await createOnDemandAuthorization();
    
    if (!dwollaAuthLinks) {
      console.error("Failed to create on-demand authorization");
      return null;
    }

    // add funding source to the dwolla customer & get the funding source url
    const fundingSourceOptions = {
      customerId: dwollaCustomerId,
      fundingSourceName: bankName,
      plaidToken: processorToken,
      _links: dwollaAuthLinks,
    };
    
    console.log("Creating funding source with options:", {
      customerId: dwollaCustomerId,
      fundingSourceName: bankName,
      hasPlaidToken: !!processorToken,
      hasAuthLinks: !!dwollaAuthLinks,
    });
    
    return await createFundingSource(fundingSourceOptions);
  } catch (err) {
    console.error("Creating funding source failed: ", err);
    return null;
  }
};

// Validate customer data before sending to Dwolla
export const validateCustomerData = (customerData: NewDwollaCustomerParams) => {
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

// Test environment variables
export const testEnvironmentVariables = () => {
  const envVars = {
    DWOLLA_ENV: process.env.DWOLLA_ENV,
    DWOLLA_KEY: process.env.DWOLLA_KEY ? "SET" : "NOT SET",
    DWOLLA_SECRET: process.env.DWOLLA_SECRET ? "SET" : "NOT SET",
    NODE_ENV: process.env.NODE_ENV,
  };
  
  console.log("Environment variables check:", envVars);
  
  // Check if required variables are missing
  const missingVars = [];
  if (!process.env.DWOLLA_ENV) missingVars.push('DWOLLA_ENV');
  if (!process.env.DWOLLA_KEY) missingVars.push('DWOLLA_KEY');
  if (!process.env.DWOLLA_SECRET) missingVars.push('DWOLLA_SECRET');
  
  if (missingVars.length > 0) {
    console.error("Missing required environment variables:", missingVars);
    return false;
  }
  
  return true;
};
