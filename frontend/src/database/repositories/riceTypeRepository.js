import { getDB } from '../db';

export const riceTypeRepository = {

  async getAll() {
    const db = getDB();
    const result = await db.query(`SELECT * FROM rice_types ORDER BY id DESC`);
    return result.values || [];
  }

};