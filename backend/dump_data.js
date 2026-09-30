
const { Product, Category, ProductImage, AdminUser } = require('./src/models');
const sequelize = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function dumpData() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const categories = await Category.findAll();
        const products = await Product.findAll({
            include: [{ model: ProductImage, as: 'images' }]
        });
        const adminUsers = await AdminUser.findAll();

        const data = {
            categories,
            products,
            adminUsers
        };

        fs.writeFileSync(path.join(__dirname, 'seed_data.json'), JSON.stringify(data, null, 2));
        console.log('Data dumped to seed_data.json');
        console.log(`Dumped ${categories.length} categories, ${products.length} products, ${adminUsers.length} admins.`);

    } catch (error) {
        console.error('Error dumping data:', error);
    } finally {
        await sequelize.close();
    }
}

dumpData();
