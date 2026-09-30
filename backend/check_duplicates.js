
const { Product, Category } = require('./src/models');
const sequelize = require('./src/config/database');

async function checkDuplicates() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // Check Categories with product counts
    const categories = await Category.findAll({
        attributes: ['id', 'category_name'],
        include: [{
            model: Product,
            as: 'products',
            attributes: ['id']
        }],
        order: [['category_name', 'ASC']]
    });
    console.log(`Total categories: ${categories.length}`);
    categories.forEach(c => console.log(`Category ID: ${c.id}, Name: "${c.category_name}", Products: ${c.products.length}`));

    // Check Products
    const products = await Product.findAll({
      attributes: ['id', 'name', 'sku', 'created_at'],
      order: [['name', 'ASC']]
    });

    console.log(`Total products: ${products.length}`);
    products.forEach(p => {
        console.log(`Product ID: ${p.id}, Name: "${p.name}"`);
        if (p.id === 6 || p.id === 8) {
            console.log(`Product ID ${p.id} details: Name: "${p.name}", SKU: "${p.sku}", Created: ${p.created_at}`);
        }
    });

    const nameMap = {};
    const duplicates = [];

    products.forEach(p => {
        if (nameMap[p.name]) {
            duplicates.push({
                type: 'Name',
                original: nameMap[p.name],
                duplicate: p.id,
                value: p.name
            });
        } else {
            nameMap[p.name] = p.id;
        }
    });

    if (duplicates.length > 0) {
      console.log('Duplicates found:');
      duplicates.forEach(d => {
        console.log(`${d.type} duplicate: ID ${d.duplicate} is a copy of ID ${d.original} (Value: "${d.value}")`);
      });
    } else {
      console.log('No duplicates found based on Name or SKU.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkDuplicates();
