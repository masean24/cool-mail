import db from '../config/database.js';

/**
 * Get all names
 */
export const getAllNames = async () => {
    const result = await db.query(
        'SELECT * FROM names ORDER BY name ASC'
    );
    return result.rows;
};

/**
 * Get active names only
 */
export const getActiveNames = async () => {
    const result = await db.query(
        'SELECT * FROM names WHERE is_active = true ORDER BY name ASC'
    );
    return result.rows;
};

/**
 * Get random active name
 */
export const getRandomName = async () => {
    const result = await db.query(
        'SELECT name FROM names WHERE is_active = true ORDER BY RANDOM() LIMIT 1'
    );
    return result.rows[0]?.name || null;
};

/**
 * Get random active name by gender
 * If gender is 'random', picks a random gender (male/female) first
 * Neutral names can be used with any gender
 */
export const getRandomNameByGender = async (gender = 'random') => {
    let targetGender = gender;

    // If random, pick male or female randomly
    if (gender === 'random') {
        targetGender = Math.random() < 0.5 ? 'male' : 'female';
    }

    // Get name matching the gender OR neutral (neutral can be used anywhere)
    const result = await db.query(
        `SELECT name FROM names 
         WHERE is_active = true AND (gender = $1 OR gender = 'neutral')
         ORDER BY RANDOM() LIMIT 1`,
        [targetGender]
    );

    return {
        name: result.rows[0]?.name || null,
        gender: targetGender
    };
};

/**
 * Add new name
 */
export const addName = async (name, gender = 'neutral') => {
    const result = await db.query(
        'INSERT INTO names (name, gender) VALUES ($1, $2) RETURNING *',
        [name.toLowerCase(), gender]
    );
    return result.rows[0];
};

/**
 * Add multiple names at once (bulk add)
 */
export const addBulkNames = async (namesArray) => {
    const results = [];
    const errors = [];

    for (const item of namesArray) {
        try {
            // Handle both string and object format
            const name = typeof item === 'string' ? item.trim() : item.name?.trim();
            const gender = typeof item === 'string' ? 'neutral' : (item.gender || 'neutral');

            if (!name || !/^[a-zA-Z]+$/.test(name)) {
                errors.push({ name, error: 'Invalid name format' });
                continue;
            }

            const result = await db.query(
                'INSERT INTO names (name, gender) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
                [name.toLowerCase(), gender]
            );

            if (result.rows[0]) {
                results.push(result.rows[0]);
            } else {
                errors.push({ name, error: 'Already exists' });
            }
        } catch (err) {
            errors.push({ name: item, error: err.message });
        }
    }

    return { added: results, errors };
};

/**
 * Update name
 */
export const updateName = async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
        fields.push(`name = $${paramCount++}`);
        values.push(updates.name.toLowerCase());
    }
    if (updates.gender !== undefined) {
        fields.push(`gender = $${paramCount++}`);
        values.push(updates.gender);
    }
    if (updates.is_active !== undefined) {
        fields.push(`is_active = $${paramCount++}`);
        values.push(updates.is_active);
    }

    if (fields.length === 0) {
        throw new Error('No fields to update');
    }

    values.push(id);
    const result = await db.query(
        `UPDATE names SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
    );
    return result.rows[0];
};

/**
 * Delete name
 */
export const deleteName = async (id) => {
    const result = await db.query(
        'DELETE FROM names WHERE id = $1 RETURNING *',
        [id]
    );
    return result.rows[0];
};

/**
 * Get names count
 */
export const getNamesCount = async () => {
    const result = await db.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM names'
    );
    return result.rows[0];
};

/**
 * Delete all names
 */
export const deleteAllNames = async () => {
    const result = await db.query('DELETE FROM names RETURNING id');
    return { count: result.rowCount };
};

export default {
    getAllNames,
    getActiveNames,
    getRandomName,
    getRandomNameByGender,
    addName,
    addBulkNames,
    updateName,
    deleteName,
    deleteAllNames,
    getNamesCount,
};
