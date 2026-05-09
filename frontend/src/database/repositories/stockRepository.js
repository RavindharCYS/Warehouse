import { getDB } from '../db';

export const stockRepository = {

  async getAll() {
    const db = getDB();

    const result = await db.query(`
      SELECT
        s.*,
        b.name AS brand_name,
        r.name AS rice_type_name,
        w.location_name AS warehouse_name
      FROM stocks s
      LEFT JOIN brands b ON s.brand_id = b.id
      LEFT JOIN rice_types r ON s.rice_type_id = r.id
      LEFT JOIN warehouses w ON s.warehouse_id = w.id
      ORDER BY s.id DESC
    `);

    return result.values || [];
  },

  async create(data) {
    const db = getDB();

    const response = await db.run(
      `INSERT INTO stocks (
        brand_id,
        rice_type_id,
        warehouse_id,
        total_bags,
        total_weight,
        buying_price,
        selling_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.brand_id,
        data.rice_type_id,
        data.warehouse_id,
        data.total_bags,
        data.total_weight,
        data.buying_price,
        data.selling_price
      ]
    );

    return response;
  },

  async addWeightBreakdown(stockId, breakdowns) {
    const db = getDB();

    for (const item of breakdowns) {
      await db.run(
        `INSERT INTO stock_weight_breakdowns (
          stock_id,
          weight,
          bag_count
        ) VALUES (?, ?, ?)`,
        [
          stockId,
          item.weight,
          item.bag_count
        ]
      );
    }
  }

};