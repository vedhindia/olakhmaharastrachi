
const { Product } = require('./src/models');
const sequelize = require('./src/config/database');

async function listProducts() {
    try {
        await sequelize.authenticate();
        const products = await Product.findAll({ attributes: ['id', 'name'] });
        console.log('Products in DB:');
        products.forEach(p => console.log(`${p.id}: ${p.name}`));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

listProducts();
