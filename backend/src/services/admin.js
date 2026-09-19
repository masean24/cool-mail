import db from '../config/database.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Get admin by username
 */
export const getAdminByUsername = async (username) => {
    const result = await db.query(
        'SELECT * FROM admin_users WHERE username = $1',
        [username]
    );
    return result.rows[0];
};

/**
 * Verify admin password
 */
export const verifyPassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};

/**
 * Create admin user
 */
export const createAdmin = async (username, password) => {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await db.query(
        'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
        [username, passwordHash]
    );
    return result.rows[0];
};

/**
 * Update admin password
 */
export const updateAdminPassword = async (id, newPassword) => {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query(
        'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
        [passwordHash, id]
    );
};

export default {
    getAdminByUsername,
    verifyPassword,
    createAdmin,
    updateAdminPassword,
};
