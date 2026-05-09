import { getDB } from '../db';

export const warehouseRepository = {

  async getAll() {
    const db = getDB();
    const result = await db.query(`SELECT * FROM warehouses ORDER BY id DESC`);
    return result.values || [];
  },

  async create(data) {
    const db = getDB();

    await db.run(
      `INSERT INTO warehouses (location_name, location_name_ta, address, capacity)
       VALUES (?, ?, ?, ?)`,
      [
        data.location_name,
        data.location_name_ta,
        data.address,
        data.capacity
      ]
    );
  },

  async remove(id) {
    const db = getDB();
    await db.run(`DELETE FROM warehouses WHERE id = ?`, [id]);
  }

};