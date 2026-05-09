import { getDB } from '../db';

export const userRepository = {

  async getAll() {
    const db = getDB();

    const result = await db.query(
      `SELECT * FROM users ORDER BY id DESC`
    );

    return result.values || [];
  },

  async create(data) {
    const db = getDB();

    await db.run(
      `INSERT INTO users (
        username,
        full_name,
        password_hash,
        role,
        email,
        phone_1,
        phone_2
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.username,
        data.full_name,
        data.password_hash,
        data.role,
        data.email,
        data.phone_1,
        data.phone_2
      ]
    );
  }

};