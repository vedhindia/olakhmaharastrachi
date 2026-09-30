
const { Product, Category, ProductImage, AdminUser } = require('./src/models');
const sequelize = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function setupLiveDb() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connected.');

        console.log('Reading seed data...');
        const dataPath = path.join(__dirname, 'seed_data.json');
        if (!fs.existsSync(dataPath)) {
            console.error('seed_data.json not found! Please run dump_data.js locally first.');
            process.exit(1);
        }
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        console.log('Syncing database (force: true)... This will DROP existing tables and recreate them.');
        await sequelize.sync({ force: true });
        console.log('Database schema reset successfully.');

        console.log('Seeding Admin Users...');
        if (data.adminUsers && data.adminUsers.length > 0) {
            await AdminUser.bulkCreate(data.adminUsers);
            console.log(`Inserted ${data.adminUsers.length} admin users.`);
        }

        console.log('Seeding Categories...');
        if (data.categories && data.categories.length > 0) {
            await Category.bulkCreate(data.categories);
            console.log(`Inserted ${data.categories.length} categories.`);
        }

        console.log('Seeding Products...');
        if (data.products && data.products.length > 0) {
            // Need to handle images separately or via include
            // Since we use bulkCreate, we can't easily include nested associations unless we use create in loop
            // Or bulkCreate with include
            
            for (const p of data.products) {
                // Ensure foreign keys are valid (category_id, created_by)
                // We assume IDs are preserved from dump
                const productData = { ...p };
                delete productData.images; // Handle images separately
                delete productData.id; // Let DB auto-increment or keep ID?
                // Keeping ID is better to maintain relationships if we seeded in order
                productData.id = p.id;

                await Product.create(productData);
                
                if (p.images && p.images.length > 0) {
                    const images = p.images.map(img => ({
                        ...img,
                        product_id: p.id
                    }));
                    await ProductImage.bulkCreate(images);
                }
            }
            console.log(`Inserted ${data.products.length} products with images.`);
        }

        console.log('Database setup complete! Real data is now live.');

    } catch (error) {
        console.error('Error setting up live database:', error);
    } finally {
        await sequelize.close();
    }
}

setupLiveDb();
