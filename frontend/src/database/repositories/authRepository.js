import { getDB } from '../db';

export const authRepository = {

  async login(username, password) {
    const db = getDB();

    const result = await db.query(
      `SELECT * FROM users WHERE username = ? LIMIT 1`,
      [username]
    );

    if (!result.values || result.values.length === 0) {
      return {
        success: false,
        message: 'User not found'
      };
    }

    const user = result.values[0];

    return {
      success: true,
      user
    };
  },

  async storeOTP(username, otp) {
    const db = getDB();

    await db.run(
      `INSERT INTO otp_logs (username, otp_code)
       VALUES (?, ?)`,
      [username, otp]
    );
  }

};