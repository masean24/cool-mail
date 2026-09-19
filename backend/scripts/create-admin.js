#!/usr/bin/env node
/**
 * Create Admin User Script
 * Usage: node scripts/create-admin.js <username> <password>
 */

import adminService from '../src/services/admin.js';
import db from '../src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    const [username, password] = process.argv.slice(2);

    if (!username || !password) {
        console.log('Usage: node scripts/create-admin.js <username> <password>');
        process.exit(1);
    }

    try {
        // Check if admin already exists
        const existing = await adminService.getAdminByUsername(username);
        if (existing) {
            console.error(`❌ Admin "${username}" already exists`);
            process.exit(1);
        }

        // Create admin
        const admin = await adminService.createAdmin(username, password);
        console.log(`✅ Admin created successfully!`);
        console.log(`   Username: ${admin.username}`);
        console.log(`   Created: ${admin.created_at}`);

        await db.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        process.exit(1);
    }
}

main();
