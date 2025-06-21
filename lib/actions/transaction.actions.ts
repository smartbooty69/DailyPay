"use server";

import { ID, Query } from "node-appwrite";
import { createAdminClient } from "../appwrite";
import { parseStringify } from "../utils";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_TRANSACTION_COLLECTION_ID: TRANSACTION_COLLECTION_ID,
} = process.env;

export const createTransaction = async (transaction: CreateTransactionProps) => {
  try {
    const { database } = await createAdminClient();

    const newTransaction = await database.createDocument(
      DATABASE_ID!,
      TRANSACTION_COLLECTION_ID!,
      ID.unique(),
      {
        channel: 'online',
        category: 'Transfer',
        ...transaction
      }
    )

    return parseStringify(newTransaction);
  } catch (error) {
    console.log(error);
    return null;
  }
}

export const getTransactionsByBankId = async ({bankId}: getTransactionsByBankIdProps) => {
  try {
    if (!bankId) {
      return { total: 0, documents: [] };
    }

    const { database } = await createAdminClient();

    // Try to get transactions where this bank is the sender or receiver
    // Use a more general query that doesn't rely on specific field names
    const allTransactions = await database.listDocuments(
      DATABASE_ID!,
      TRANSACTION_COLLECTION_ID!,
      [], // No filters - get all transactions
    );

    // Filter transactions in memory where this bank is involved
    const relevantTransactions = allTransactions.documents.filter((transaction: any) => {
      return transaction.senderBankId === bankId || transaction.receiverBankId === bankId;
    });

    const transactions = {
      total: relevantTransactions.length,
      documents: relevantTransactions
    };

    return parseStringify(transactions);
  } catch (error) {
    console.log("Error getting transactions by bank ID:", error);
    return { total: 0, documents: [] };
  }
}