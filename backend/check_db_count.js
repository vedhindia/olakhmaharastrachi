
const { Product, Category } = require('./src/models');
const sequelize = require('./src/config/database');

async function checkData() {
    try {
        await sequelize.authenticate();
        console.log('Connected');
        const productCount = await Product.count();
        const categoryCount = await Category.count();
        console.log(`Products: ${productCount}`);
        console.log(`Categories: ${categoryCount}`);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

checkData();
