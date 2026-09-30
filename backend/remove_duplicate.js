
const { Product, ProductImage, Category } = require('./src/models');
const sequelize = require('./src/config/database');

async function removeDuplicate() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // ID 6 (hira besan) is likely a duplicate/test product
    // ID 3 (besan) is likely a duplicate/test category
    const productIdsToRemove = [6];
    const categoryIdsToRemove = [3];

    // Remove Products
    for (const id of productIdsToRemove) {
        const product = await Product.findByPk(id);
        if (!product) {
            console.log(`Product with ID ${id} not found.`);
            continue;
        }

        console.log(`Found likely duplicate/test product: ${product.name} (ID: ${product.id})`);
        
        // Check if it has images
        const images = await ProductImage.findAll({ where: { product_id: id } });
        console.log(`Found ${images.length} images associated with the product.`);

        if (images.length > 0) {
            await ProductImage.destroy({ where: { product_id: id } });
            console.log('Deleted associated images.');
        }

        await Product.destroy({ where: { id: id } });
        console.log(`Successfully deleted product (ID: ${id}).`);
    }

    // Remove Categories
    for (const id of categoryIdsToRemove) {
        const category = await Category.findByPk(id);
        if (!category) {
            console.log(`Category with ID ${id} not found.`);
            continue;
        }

        console.log(`Found likely duplicate/test category: ${category.category_name} (ID: ${category.id})`);
        
        // Check if it has products (should be 0 now)
        const productCount = await Product.count({ where: { category_id: id } });
        if (productCount > 0) {
            console.log(`Warning: Category ${id} still has ${productCount} products. Skipping deletion.`);
            continue;
        }

        await Category.destroy({ where: { id: id } });
        console.log(`Successfully deleted category (ID: ${id}).`);
    }

  } catch (error) {
    console.error('Error removing duplicates:', error);
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

removeDuplicate();
