import { getDB } from '../db';

export const transactionRepository = {

  async getAll() {
    const db = getDB();

    const result = await db.query(`
      SELECT *
      FROM transactions
      ORDER BY id DESC
    `);

    return result.values || [];
  },

  async create(data) {
    const db = getDB();

    const tx = await db.run(
      `INSERT INTO transactions (
        transaction_type,
        customer_name,
        vehicle_number,
        remarks,
        total_bags,
        total_weight,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.transaction_type,
        data.customer_name,
        data.vehicle_number,
        data.remarks,
        data.total_bags,
        data.total_weight,
        data.created_by
      ]
    );

    return tx;
  },

  async createTransactionItem(data) {
    const db = getDB();

    await db.run(
      `INSERT INTO transaction_items (
        transaction_id,
        stock_id,
        quantity,
        total_weight
      ) VALUES (?, ?, ?, ?)`,
      [
        data.transaction_id,
        data.stock_id,
        data.quantity,
        data.total_weight
      ]
    );
  },

  async getTransactionItems(transactionId) {
    const db = getDB();

    const result = await db.query(
      `SELECT * FROM transaction_items WHERE transaction_id = ?`,
      [transactionId]
    );

    return result.values || [];
  }

};