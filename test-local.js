
const http = require('http');

const url = 'http://localhost:5000/api/products?limit=5&page=1';

http.get(url, (res) => {
  console.log('StatusCode:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);
        console.log('Products found:', json.products ? json.products.length : 0);
        if (json.products && json.products.length > 0) {
             console.log('First product:', json.products[0].name);
        } else {
             console.log('Response:', json);
        }
      } catch (e) {
        console.error('Error parsing JSON:', e);
        console.log('Raw data:', data);
      }
    } else {
      console.log('Response:', data);
    }
  });

}).on('error', (e) => {
  console.error(e);
});
